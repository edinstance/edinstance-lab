package server

import (
	"net/http"
	"net/url"
	"strings"
)

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	parsedOrigin, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if parsedOrigin.Scheme != "http" && parsedOrigin.Scheme != "https" {
		return false
	}
	host := strings.ToLower(parsedOrigin.Hostname())
	return host == "localhost" ||
		host == "127.0.0.1" ||
		host == "ui.edinstance.uk" ||
		host == "ui.local.edinstance.uk"
}
