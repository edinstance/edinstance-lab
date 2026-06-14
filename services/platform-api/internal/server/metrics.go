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

type prometheusResponse struct {
	Status string `json:"status"`
	Data   struct {
		Result []struct {
			Metric map[string]string `json:"metric"`
			Values [][]any           `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

type metricSeries struct {
	Pod    string       `json:"pod"`
	Values [][2]float64 `json:"values"`
}

var prometheusClient = &http.Client{Timeout: 8 * time.Second}

func (s *Server) getAppMetrics(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !appNamePattern.MatchString(name) {
		writeError(w, http.StatusBadRequest, "invalid app name")
		return
	}
	namespace := queryValue(r, "namespace", s.cfg.AppsNamespace)
	app := queryValue(r, "app", name)
	if !appNamePattern.MatchString(namespace) || !appNamePattern.MatchString(app) {
		writeError(w, http.StatusBadRequest, "invalid metrics selector")
		return
	}
	hours := 6
	if parsed, err := strconv.Atoi(r.URL.Query().Get("hours")); err == nil && (parsed == 1 || parsed == 6 || parsed == 24 || parsed == 168) {
		hours = parsed
	}
	end := time.Now()
	start := end.Add(-time.Duration(hours) * time.Hour)
	step := max(30, hours*60)
	namespace = escapePrometheusLabel(namespace)
	app = escapePrometheusLabel(app)
	queries := map[string]string{
		"cpu":    fmt.Sprintf(`sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="%s",pod=~"%s-.*",container!="",container!="POD"}[5m]))`, namespace, app),
		"memory": fmt.Sprintf(`sum by (pod) (container_memory_working_set_bytes{namespace="%s",pod=~"%s-.*",container!="",container!="POD"})`, namespace, app),
	}
	result := make(map[string][]metricSeries, len(queries))
	for key, query := range queries {
		series, err := s.queryPrometheus(r, query, start, end, step)
		if err != nil {
			s.logger.ErrorContext(r.Context(), "failed to query service metrics", "operation", "metrics.query", "app_name", name, "metric", key, "error", err)
			writeError(w, http.StatusBadGateway, "unable to load service metrics")
			return
		}
		result[key] = series
	}
	writeJSON(w, http.StatusOK, map[string]any{"rangeHours": hours, "series": result})
}

func (s *Server) queryPrometheus(r *http.Request, query string, start, end time.Time, step int) ([]metricSeries, error) {
	endpoint, err := url.Parse(s.cfg.PrometheusURL + "/api/v1/query_range")
	if err != nil {
		return nil, err
	}
	params := endpoint.Query()
	params.Set("query", query)
	params.Set("start", strconv.FormatInt(start.Unix(), 10))
	params.Set("end", strconv.FormatInt(end.Unix(), 10))
	params.Set("step", strconv.Itoa(step))
	endpoint.RawQuery = params.Encode()
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := prometheusClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prometheus returned %s", response.Status)
	}
	var body prometheusResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return nil, err
	}
	series := make([]metricSeries, 0, len(body.Data.Result))
	for _, item := range body.Data.Result {
		points := make([][2]float64, 0, len(item.Values))
		for _, value := range item.Values {
			if len(value) != 2 {
				continue
			}
			timestamp, ok := value[0].(float64)
			raw, valueOK := value[1].(string)
			parsed, parseErr := strconv.ParseFloat(raw, 64)
			if ok && valueOK && parseErr == nil {
				points = append(points, [2]float64{timestamp, parsed})
			}
		}
		series = append(series, metricSeries{Pod: item.Metric["pod"], Values: points})
	}
	return series, nil
}

func queryValue(r *http.Request, key, fallback string) string {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}
	return value
}

func escapePrometheusLabel(value string) string {
	return strings.ReplaceAll(value, `\`, `\\`)
}
