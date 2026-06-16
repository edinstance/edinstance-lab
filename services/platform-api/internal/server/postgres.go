package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/edinstance/edinstance-lab/services/platform-api/internal/reconciler"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

var storageSizePattern = regexp.MustCompile(`^[1-9][0-9]*(Gi|Ti)$`)

var reservedPostgresOwners = map[string]struct{}{
	"cnpg_metrics_exporter": {},
	"cnpg_pooler_pgbouncer": {},
	"postgres":              {},
	"streaming_replica":     {},
}

func (s *Server) listPostgresDatabases(w http.ResponseWriter, _ *http.Request) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database storage is not configured")
		return
	}
	rows, err := s.db.Query(`
		select name, namespace, database_name, owner_name, version, instances, storage_size,
			pooler_enabled, pooler_instances, pool_mode, public, public_hostname,
			array_to_json(public_source_cidrs), status
		from postgres_databases order by name
	`)
	if err != nil {
		s.logger.Error("failed to query databases", "error", err)
		writeError(w, http.StatusInternalServerError, "unable to load databases")
		return
	}
	defer rows.Close()
	databases := []PostgresDatabase{}
	for rows.Next() {
		var database PostgresDatabase
		var publicSourceCIDRsJSON []byte
		if err := rows.Scan(&database.Name, &database.Namespace, &database.Database, &database.Owner,
			&database.Version, &database.Instances, &database.StorageSize, &database.PoolerEnabled,
			&database.PoolerInstances, &database.PoolMode, &database.Public,
			&database.PublicHostname, &publicSourceCIDRsJSON, &database.Status); err != nil {
			s.logger.Error("failed to scan database", "error", err)
			writeError(w, http.StatusInternalServerError, "unable to load databases")
			return
		}
		if err := json.Unmarshal(publicSourceCIDRsJSON, &database.PublicSourceCIDRs); err != nil {
			s.logger.Error("failed to decode database source CIDRs", "name", database.Name, "error", err)
			writeError(w, http.StatusInternalServerError, "unable to load databases")
			return
		}
		populatePostgresConnection(&database)
		databases = append(databases, database)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("failed while reading databases", "error", err)
		writeError(w, http.StatusInternalServerError, "unable to load databases")
		return
	}
	writeJSON(w, http.StatusOK, map[string][]PostgresDatabase{"databases": databases})
}

func (s *Server) createPostgresDatabase(w http.ResponseWriter, r *http.Request) {
	if s.db == nil || s.reconciler == nil {
		writeError(w, http.StatusServiceUnavailable, "database reconciliation is not configured")
		return
	}
	var req CreatePostgresRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	applyPostgresDefaults(&req)
	if err := validatePostgresRequest(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if s.secretCipher == nil {
		writeError(w, http.StatusServiceUnavailable, "credential encryption is not configured")
		return
	}
	encryptedPassword, err := s.secretCipher.Encrypt(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to encrypt database credentials")
		return
	}
	var exists bool
	if err := s.db.QueryRow("select exists(select 1 from postgres_databases where name = $1)", req.Name).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "unable to check database name")
		return
	}
	if exists {
		writeError(w, http.StatusConflict, "database already exists")
		return
	}
	namespace := s.cfg.AppsNamespace
	spec := reconciler.PostgresSpec{
		Name: req.Name, Namespace: namespace, Database: req.Database, Owner: req.Owner,
		Password: req.Password, Version: req.Version, Instances: req.Instances,
		StorageSize: req.StorageSize, PoolerEnabled: req.PoolerEnabled,
		PoolerInstances: req.PoolerInstances, PoolMode: req.PoolMode,
		Public: req.Public, PublicHostname: req.PublicHostname,
		PublicSourceCIDRs: req.PublicSourceCIDRs,
	}
	if err := s.reconciler.ReconcilePostgres(r.Context(), spec); err != nil {
		s.logger.Error("failed to reconcile postgres database", "name", req.Name, "error", err)
		writeError(w, http.StatusBadGateway, "unable to create PostgreSQL resources")
		return
	}
	_, err = s.db.Exec(`
		insert into postgres_databases
			(id, name, namespace, storage_size, version, status, instances, database_name,
			 owner_name, pooler_enabled, pooler_instances, pool_mode, public, public_hostname,
			 public_source_cidrs, password_encrypted)
		values ($1::uuid,$2,$3,$4,$5,'provisioning',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
	`, uuid.NewString(), req.Name, namespace, req.StorageSize, req.Version, req.Instances,
		req.Database, req.Owner, req.PoolerEnabled, req.PoolerInstances, req.PoolMode,
		req.Public, req.PublicHostname, req.PublicSourceCIDRs, encryptedPassword)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "database already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "unable to store database")
		return
	}
	database := PostgresDatabase{
		Name: req.Name, Namespace: namespace, Database: req.Database, Owner: req.Owner,
		Version: req.Version, Instances: req.Instances, StorageSize: req.StorageSize,
		PoolerEnabled: req.PoolerEnabled, PoolerInstances: req.PoolerInstances,
		PoolMode: req.PoolMode, Status: "provisioning",
		Public: req.Public, PublicHostname: req.PublicHostname,
		PublicSourceCIDRs: req.PublicSourceCIDRs,
	}
	populatePostgresConnection(&database)
	writeJSON(w, http.StatusCreated, database)
}

func (s *Server) getPostgresCredentials(w http.ResponseWriter, r *http.Request) {
	if s.db == nil || s.secretCipher == nil {
		writeError(w, http.StatusServiceUnavailable, "database credentials are not configured")
		return
	}
	var database PostgresDatabase
	var encryptedPassword *string
	err := s.db.QueryRow(`
		select name, namespace, database_name, owner_name, pooler_enabled, public,
			public_hostname, password_encrypted
		from postgres_databases where name = $1
	`, r.PathValue("name")).Scan(&database.Name, &database.Namespace, &database.Database,
		&database.Owner, &database.PoolerEnabled, &database.Public,
		&database.PublicHostname, &encryptedPassword)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to load database credentials")
		return
	}
	if encryptedPassword == nil || *encryptedPassword == "" {
		writeError(w, http.StatusNotFound, "credentials are unavailable for this database")
		return
	}
	password, err := s.secretCipher.Decrypt(*encryptedPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to decrypt database credentials")
		return
	}
	populatePostgresConnection(&database)
	host := database.Host
	if database.Public && database.PublicHostname != "" {
		host = database.PublicHostname
	}
	connection := url.URL{
		Scheme: "postgresql",
		User:   url.UserPassword(database.Owner, password),
		Host:   net.JoinHostPort(host, "5432"),
		Path:   database.Database,
	}
	query := connection.Query()
	query.Set("sslmode", "require")
	connection.RawQuery = query.Encode()
	writeJSON(w, http.StatusOK, PostgresCredentials{
		Host: host, Port: 5432, Database: database.Database, Username: database.Owner,
		Password: password, URL: connection.String(),
	})
}

func (s *Server) deletePostgresDatabase(w http.ResponseWriter, r *http.Request) {
	if s.db == nil || s.reconciler == nil {
		writeError(w, http.StatusServiceUnavailable, "database reconciliation is not configured")
		return
	}
	name := r.PathValue("name")
	var exists bool
	if err := s.db.QueryRow("select exists(select 1 from postgres_databases where name = $1)", name).Scan(&exists); err != nil {
		s.logger.Error("failed to check database", "name", name, "error", err)
		writeError(w, http.StatusInternalServerError, "unable to delete database")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "database not found")
		return
	}
	if err := s.reconciler.DeletePostgres(r.Context(), name); err != nil {
		s.logger.Error("failed to delete postgres resources", "name", name, "error", err)
		writeError(w, http.StatusBadGateway, "unable to delete PostgreSQL resources")
		return
	}
	if _, err := s.db.Exec("delete from postgres_databases where name = $1", name); err != nil {
		s.logger.Error("failed to delete database record", "name", name, "error", err)
		writeError(w, http.StatusInternalServerError, "unable to delete database")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func applyPostgresDefaults(req *CreatePostgresRequest) {
	if req.Database == "" {
		req.Database = "app"
	}
	if req.Owner == "" {
		req.Owner = "app"
	}
	if req.Version == "" {
		req.Version = "17"
	}
	if req.Instances == 0 {
		req.Instances = 3
	}
	if req.StorageSize == "" {
		req.StorageSize = "20Gi"
	}
	if req.PoolerInstances == 0 {
		req.PoolerInstances = 2
	}
	if req.PoolMode == "" {
		req.PoolMode = "session"
	}
}

func validatePostgresRequest(req CreatePostgresRequest) error {
	if !appNamePattern.MatchString(req.Name) {
		return errors.New("name must be a DNS-safe lowercase slug")
	}
	if !appNamePattern.MatchString(req.Database) || !appNamePattern.MatchString(req.Owner) {
		return errors.New("database and owner must be lowercase DNS-safe names")
	}
	if _, reserved := reservedPostgresOwners[req.Owner]; reserved || strings.HasPrefix(req.Owner, "cnpg_") {
		return errors.New("owner must not use a reserved PostgreSQL role")
	}
	if len(req.Password) < 12 {
		return errors.New("password must be at least 12 characters")
	}
	if req.Version != "16" && req.Version != "17" {
		return errors.New("PostgreSQL version must be 16 or 17")
	}
	if req.Instances < 1 || req.Instances > 5 {
		return errors.New("instances must be between 1 and 5")
	}
	if !storageSizePattern.MatchString(req.StorageSize) {
		return errors.New("storage size must look like 20Gi or 1Ti")
	}
	if req.PoolerInstances < 1 || req.PoolerInstances > 5 {
		return errors.New("pooler instances must be between 1 and 5")
	}
	if req.PoolMode != "session" && req.PoolMode != "transaction" {
		return errors.New("pool mode must be session or transaction")
	}
	if req.Public {
		if !validHostname(req.PublicHostname) {
			return errors.New("local hostname must be a valid DNS hostname")
		}
		if !strings.HasSuffix(req.PublicHostname, ".local.edinstance.uk") {
			return errors.New("local hostname must end with .local.edinstance.uk")
		}
		if !req.PoolerEnabled {
			return errors.New("local access requires PgBouncer")
		}
		for _, cidr := range req.PublicSourceCIDRs {
			if _, _, err := net.ParseCIDR(cidr); err != nil {
				return fmt.Errorf("invalid public source CIDR %q", cidr)
			}
		}
	}
	return nil
}

func validHostname(host string) bool {
	if len(host) < 1 || len(host) > 253 || strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if !appNamePattern.MatchString(label) {
			return false
		}
	}
	return true
}

func populatePostgresConnection(database *PostgresDatabase) {
	service := database.Name + "-rw"
	if database.PoolerEnabled {
		service = database.Name + "-pooler-rw"
	}
	database.Host = fmt.Sprintf("%s.%s.svc.cluster.local", service, database.Namespace)
	database.CredentialsSecret = database.Name + "-app"
	database.Status = strings.TrimSpace(database.Status)
}
