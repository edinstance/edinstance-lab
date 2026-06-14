package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type lokiResponse struct {
	Status string `json:"status"`
	Data   struct {
		Result []struct {
			Stream map[string]string `json:"stream"`
			Values [][2]string       `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

type logEntry struct {
	Timestamp string `json:"timestamp"`
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Level     string `json:"level,omitempty"`
	Message   string `json:"message"`
}

var lokiClient = &http.Client{Timeout: 8 * time.Second}

func (s *Server) getAppLogs(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !appNamePattern.MatchString(name) {
		writeError(w, http.StatusBadRequest, "invalid app name")
		return
	}
	namespace := queryValue(r, "namespace", s.cfg.AppsNamespace)
	app := queryValue(r, "app", name)
	if !appNamePattern.MatchString(namespace) || !appNamePattern.MatchString(app) {
		writeError(w, http.StatusBadRequest, "invalid log selector")
		return
	}
	limit := 100
	if parsed, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && parsed > 0 && parsed <= 500 {
		limit = parsed
	}

	entries, err := s.queryLokiLogs(r, namespace, app, limit)
	if err != nil {
		s.logger.ErrorContext(r.Context(), "failed to query service logs", "operation", "logs.query", "app_name", name, "namespace", namespace, "selector", app, "error", err)
		writeError(w, http.StatusBadGateway, "unable to load service logs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func (s *Server) queryLokiLogs(r *http.Request, namespace, app string, limit int) ([]logEntry, error) {
	endpoint, err := url.Parse(s.cfg.LokiURL + "/loki/api/v1/query_range")
	if err != nil {
		return nil, err
	}
	query := fmt.Sprintf(`{namespace="%s", pod=~"%s-.*"}`, escapeLogQLString(namespace), escapeLogQLString(app))
	params := endpoint.Query()
	params.Set("query", query)
	params.Set("limit", strconv.Itoa(limit))
	params.Set("direction", "backward")
	params.Set("start", strconv.FormatInt(time.Now().Add(-6*time.Hour).UnixNano(), 10))
	params.Set("end", strconv.FormatInt(time.Now().UnixNano(), 10))
	endpoint.RawQuery = params.Encode()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := lokiClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki returned %s", response.Status)
	}
	var body lokiResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return nil, err
	}

	entries := make([]logEntry, 0, limit)
	for _, stream := range body.Data.Result {
		for _, value := range stream.Values {
			if len(value) != 2 {
				continue
			}
			entries = append(entries, logEntry{
				Timestamp: formatLokiTimestamp(value[0]),
				Namespace: stream.Stream["namespace"],
				Pod:       stream.Stream["pod"],
				Container: stream.Stream["container"],
				Level:     logLevelFromLine(value[1]),
				Message:   value[1],
			})
		}
	}
	return entries, nil
}

func formatLokiTimestamp(raw string) string {
	nanos, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return raw
	}
	return time.Unix(0, nanos).UTC().Format(time.RFC3339)
}

func logLevelFromLine(line string) string {
	lower := strings.ToLower(line)
	for _, level := range []string{"error", "warn", "info", "debug"} {
		if strings.Contains(lower, level) {
			return level
		}
	}
	return ""
}

func escapeLogQLString(value string) string {
	return strings.ReplaceAll(value, `\`, `\\`)
}
