package server

import (
	"net/http"
	"strings"

	platformauth "github.com/edinstance/edinstance-lab/services/platform-api/internal/auth"
)

func (s *Server) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.isAuthenticated(r) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next(w, r)
	}
}

func (s *Server) isAuthenticated(r *http.Request) bool {
	claims := s.authClaims(r)
	return claims != nil && claims.Subject != ""
}

func (s *Server) authClaims(r *http.Request) *platformauth.Claims {
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" || s.keyStore == nil {
		return nil
	}
	claims, err := s.keyStore.VerifyJWT(r.Context(), token, s.cfg.AuthIssuer, s.cfg.AuthAudience)
	if err != nil {
		return nil
	}
	return claims
}

func bearerToken(header string) string {
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}
