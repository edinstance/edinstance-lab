package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/edinstance/edinstance-lab/services/platform-api/internal/envfile"
)

func (s *Server) listEnvVars(w http.ResponseWriter, r *http.Request) {
	serviceID, ok := s.envServiceID(w, r)
	if !ok {
		return
	}
	vars, err := s.listEnvVarMetadata(serviceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to load environment variables")
		return
	}
	writeJSON(w, http.StatusOK, map[string][]EnvVarMetadata{"env": vars})
}

func (s *Server) putEnvVar(w http.ResponseWriter, r *http.Request) {
	if s.secretCipher == nil {
		writeError(w, http.StatusServiceUnavailable, "env encryption is not configured")
		return
	}
	name := r.PathValue("variable")
	if !envfile.ValidName(name) {
		writeError(w, http.StatusBadRequest, "invalid environment variable name")
		return
	}
	var body struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	serviceID, ok := s.envServiceID(w, r)
	if !ok {
		return
	}
	encrypted, err := s.secretCipher.Encrypt(body.Value)
	if err != nil || s.upsertEnvVar(serviceID, name, encrypted) != nil {
		writeError(w, http.StatusInternalServerError, "unable to store environment variable")
		return
	}
	writeJSON(w, http.StatusOK, EnvVarMetadata{Name: name, Secret: true})
}

func (s *Server) deleteEnvVar(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("variable")
	if !envfile.ValidName(name) {
		writeError(w, http.StatusBadRequest, "invalid environment variable name")
		return
	}
	serviceID, ok := s.envServiceID(w, r)
	if !ok {
		return
	}
	if err := s.deleteEnvVarByName(serviceID, name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "environment variable not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "unable to delete environment variable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) envServiceID(w http.ResponseWriter, r *http.Request) (string, bool) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database-backed env storage is not configured")
		return "", false
	}
	serviceID, err := s.serviceIDByName(strings.TrimSpace(r.PathValue("name")))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "app not found")
		} else {
			writeError(w, http.StatusInternalServerError, "unable to load app")
		}
		return "", false
	}
	return serviceID, true
}
