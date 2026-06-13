package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"regexp"
	"strings"

	"github.com/edinstance/edinstance-lab/services/platform-api/internal/reconciler"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

var storageSizePattern = regexp.MustCompile(`^[1-9][0-9]*(Gi|Ti)$`)

func (s *Server) listPostgresDatabases(w http.ResponseWriter, _ *http.Request) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database storage is not configured")
		return
	}
	rows, err := s.db.Query(`
		select name, namespace, database_name, owner_name, version, instances, storage_size,
			pooler_enabled, pooler_instances, pool_mode, public, public_hostname,
			public_source_cidrs, status
		from postgres_databases order by name
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to load databases")
		return
	}
	defer rows.Close()
	databases := []PostgresDatabase{}
	for rows.Next() {
		var database PostgresDatabase
		if err := rows.Scan(&database.Name, &database.Namespace, &database.Database, &database.Owner,
			&database.Version, &database.Instances, &database.StorageSize, &database.PoolerEnabled,
			&database.PoolerInstances, &database.PoolMode, &database.Public,
			&database.PublicHostname, &database.PublicSourceCIDRs, &database.Status); err != nil {
			writeError(w, http.StatusInternalServerError, "unable to load databases")
			return
		}
		populatePostgresConnection(&database)
		databases = append(databases, database)
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
	_, err := s.db.Exec(`
		insert into postgres_databases
			(id, name, namespace, storage_size, version, status, instances, database_name,
			 owner_name, pooler_enabled, pooler_instances, pool_mode, public, public_hostname,
			 public_source_cidrs)
		values ($1::uuid,$2,$3,$4,$5,'provisioning',$6,$7,$8,$9,$10,$11,$12,$13,$14)
	`, uuid.NewString(), req.Name, namespace, req.StorageSize, req.Version, req.Instances,
		req.Database, req.Owner, req.PoolerEnabled, req.PoolerInstances, req.PoolMode,
		req.Public, req.PublicHostname, req.PublicSourceCIDRs)
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
			return errors.New("public hostname must be a valid DNS hostname")
		}
		if !req.PoolerEnabled {
			return errors.New("public access requires PgBouncer")
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
