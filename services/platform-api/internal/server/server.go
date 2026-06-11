package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	platformauth "github.com/edinstance/edinstance-lab/services/platform-api/internal/auth"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/config"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/envfile"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/platformdb"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/reconciler"
	platformsecrets "github.com/edinstance/edinstance-lab/services/platform-api/internal/secrets"
	"github.com/jackc/pgx/v5/pgconn"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

var appNamePattern = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)

type Server struct {
	cfg          config.Config
	logger       *slog.Logger
	db           *platformdb.DB
	secretCipher *platformsecrets.Cipher
	reconciler   *reconciler.Reconciler
	keyStore     *platformauth.KeyStore
	apps         []App
}

func New(cfg config.Config, logger *slog.Logger, db *platformdb.DB, secretCipher *platformsecrets.Cipher, appReconciler *reconciler.Reconciler, keyStore *platformauth.KeyStore) http.Handler {
	s := &Server{
		cfg:          cfg,
		logger:       logger,
		db:           db,
		secretCipher: secretCipher,
		reconciler:   appReconciler,
		keyStore:     keyStore,
		apps:         []App{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /api/apps", s.withAuth(s.listApps))
	mux.HandleFunc("POST /api/apps", s.withAuth(s.createApp))
	mux.HandleFunc("GET /api/apps/{name}", s.withAuth(s.getApp))
	mux.HandleFunc("DELETE /api/apps/{name}", s.withAuth(s.deleteApp))
	mux.HandleFunc("POST /api/apps/{name}/env-file", s.withAuth(s.uploadEnvFile))

	return s.withCORS(otelhttp.NewHandler(mux, cfg.ServiceName))
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) listApps(w http.ResponseWriter, r *http.Request) {
	if s.db != nil {
		if err := s.refreshAllStatusesIfEnabled(r.Context()); err != nil {
			s.logger.Warn("failed to refresh app statuses", "error", err)
		}
		apps, err := s.listAppsFromDB()
		if err != nil {
			s.logger.Error("failed to list apps from database", "error", err)
			writeError(w, http.StatusInternalServerError, "unable to load platform apps")
			return
		}
		writeJSON(w, http.StatusOK, map[string][]App{"apps": apps})
		return
	}
	writeJSON(w, http.StatusOK, map[string][]App{"apps": s.apps})
}

func (s *Server) createApp(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database-backed app storage is not configured")
		return
	}

	var req CreateAppRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := validateCreateAppRequest(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Replicas == 0 {
		req.Replicas = 2
	}

	app, err := s.insertApp(req)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "app already exists")
			return
		}
		s.logger.Error("failed to create app", "name", req.Name, "error", err)
		writeError(w, http.StatusInternalServerError, "unable to create app")
		return
	}
	writeJSON(w, http.StatusCreated, app)
}

func (s *Server) getApp(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if s.db != nil {
		if err := s.refreshAppStatusIfEnabled(r.Context(), name); err != nil {
			s.logger.Warn("failed to refresh app status", "name", name, "error", err)
		}
		app, err := s.getAppFromDB(name)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusNotFound, "app not found")
				return
			}
			s.logger.Error("failed to get app from database", "name", name, "error", err)
			writeError(w, http.StatusInternalServerError, "unable to load platform app")
			return
		}
		writeJSON(w, http.StatusOK, app)
		return
	}
	for _, app := range s.apps {
		if app.Name == name {
			writeJSON(w, http.StatusOK, app)
			return
		}
	}
	writeError(w, http.StatusNotFound, "app not found")
}

func (s *Server) deleteApp(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database-backed app storage is not configured")
		return
	}
	name := r.PathValue("name")
	var result sql.Result
	var err error
	if s.reconciler == nil {
		result, err = s.db.Exec("delete from services where name = $1", name)
	} else {
		result, err = s.db.Exec(`
			update services
			set reconcile_state = 'deleting', deletion_requested_at = coalesce(deletion_requested_at, now()),
				reconcile_attempts = 0, next_reconcile_at = now(), last_reconcile_error = null, updated_at = now()
			where name = $1
		`, name)
	}
	if err != nil {
		s.logger.Error("failed to delete app", "name", name, "error", err)
		writeError(w, http.StatusInternalServerError, "unable to delete app")
		return
	}
	rows, err := result.RowsAffected()
	if err != nil {
		s.logger.Error("failed to inspect delete result", "name", name, "error", err)
		writeError(w, http.StatusInternalServerError, "unable to delete app")
		return
	}
	if rows == 0 {
		writeError(w, http.StatusNotFound, "app not found")
		return
	}
	if s.reconciler == nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "deleting"})
}

func (s *Server) uploadEnvFile(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database-backed env storage is not configured")
		return
	}
	if s.secretCipher == nil {
		writeError(w, http.StatusServiceUnavailable, "env encryption is not configured")
		return
	}

	content, err := readEnvFileContent(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	vars, err := envfile.Parse(content)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	serviceID, err := s.serviceIDByName(r.PathValue("name"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "app not found")
			return
		}
		s.logger.Error("failed to look up service for env upload", "error", err)
		writeError(w, http.StatusInternalServerError, "unable to store env file")
		return
	}

	stored := make([]EnvVarMetadata, 0, len(vars))
	encryptedVars := make(map[string]string, len(vars))
	for _, variable := range vars {
		encrypted, err := s.secretCipher.Encrypt(variable.Value)
		if err != nil {
			s.logger.Error("failed to encrypt env value", "name", variable.Name, "error", err)
			writeError(w, http.StatusInternalServerError, "unable to store env file")
			return
		}
		encryptedVars[variable.Name] = encrypted
		stored = append(stored, EnvVarMetadata{Name: variable.Name, Secret: true})
	}
	if err := s.replaceEnvVars(serviceID, encryptedVars); err != nil {
		s.logger.Error("failed to store env values", "name", r.PathValue("name"), "error", err)
		writeError(w, http.StatusInternalServerError, "unable to store env file")
		return
	}
	writeJSON(w, http.StatusOK, map[string][]EnvVarMetadata{"env": stored})
}

func validateCreateAppRequest(req CreateAppRequest) error {
	if !appNamePattern.MatchString(req.Name) {
		return errors.New("name must be a DNS-safe lowercase slug")
	}
	if strings.TrimSpace(req.Image) == "" {
		return errors.New("image is required")
	}
	if req.Port < 1 || req.Port > 65535 {
		return errors.New("port must be between 1 and 65535")
	}
	if req.Replicas < 0 || req.Replicas > 20 {
		return errors.New("replicas must be between 0 and 20")
	}
	for _, hostname := range req.Domains {
		if strings.TrimSpace(hostname) == "" {
			return errors.New("domains must not contain blank hostnames")
		}
	}
	return nil
}

func domainScope(hostname string) string {
	if strings.HasSuffix(hostname, ".local.edinstance.uk") {
		return "local"
	}
	return "public"
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Error("writeJSON: failed to encode response", "status", status, "type", fmt.Sprintf("%T", value), "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
