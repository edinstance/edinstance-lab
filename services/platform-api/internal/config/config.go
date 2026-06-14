package config

import (
	"errors"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Addr                  string
	AuthJWKSURL           string
	AuthIssuer            string
	AuthAudience          string
	LogLevel              slog.Level
	ServiceName           string
	ServiceVersion        string
	TraceSampleRatio      float64
	OTLPEndpoint          string
	PrometheusURL         string
	LokiURL               string
	DatabaseURL           string
	PlatformEncryptionKey string
	ReconcileEnabled      bool
	AppsNamespace         string
	GatewayNamespace      string
	GatewayName           string
	GatewaySectionName    string
	Kubeconfig            string
}

func Load() Config {
	return Config{
		Addr:                  value("PLATFORM_API_ADDR", ":8080"),
		AuthJWKSURL:           os.Getenv("PLATFORM_AUTH_JWKS_URL"),
		AuthIssuer:            os.Getenv("PLATFORM_AUTH_ISSUER"),
		AuthAudience:          os.Getenv("PLATFORM_AUTH_AUDIENCE"),
		LogLevel:              logLevel(value("LOG_LEVEL", "info")),
		ServiceName:           value("OTEL_SERVICE_NAME", "platform-api"),
		ServiceVersion:        value("OTEL_SERVICE_VERSION", "dev"),
		TraceSampleRatio:      traceSampleRatio(),
		OTLPEndpoint:          value("OTEL_EXPORTER_OTLP_ENDPOINT", "http://opentelemetry-collector.opentelemetry.svc.cluster.local:4318"),
		PrometheusURL:         value("PROMETHEUS_URL", "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090"),
		LokiURL:               value("LOKI_URL", "http://monitoring-loki-gateway.monitoring.svc.cluster.local"),
		DatabaseURL:           databaseURL(),
		PlatformEncryptionKey: os.Getenv("PLATFORM_ENCRYPTION_KEY"),
		ReconcileEnabled:      strings.EqualFold(os.Getenv("PLATFORM_RECONCILE_ENABLED"), "true"),
		AppsNamespace:         value("PLATFORM_APPS_NAMESPACE", "apps"),
		GatewayNamespace:      value("PLATFORM_GATEWAY_NAMESPACE", "gateway-system"),
		GatewayName:           value("PLATFORM_GATEWAY_NAME", "main-gateway"),
		GatewaySectionName:    value("PLATFORM_GATEWAY_SECTION_NAME", "http-local"),
		Kubeconfig:            os.Getenv("KUBECONFIG"),
	}
}

func traceSampleRatio() float64 {
	fallback := 1.0
	if strings.EqualFold(value("OTEL_RESOURCE_ATTRIBUTES", ""), "deployment.environment=homelab") {
		fallback = 0.2
	}
	raw := value("OTEL_TRACES_SAMPLER_ARG", "")
	if raw == "" {
		return fallback
	}
	ratio, err := strconv.ParseFloat(raw, 64)
	if err != nil || ratio < 0 || ratio > 1 {
		return fallback
	}
	return ratio
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.AuthJWKSURL) == "" {
		return errors.New("PLATFORM_AUTH_JWKS_URL must be set")
	}
	if strings.TrimSpace(c.AuthIssuer) == "" {
		return errors.New("PLATFORM_AUTH_ISSUER must be set")
	}
	if strings.TrimSpace(c.AuthAudience) == "" {
		return errors.New("PLATFORM_AUTH_AUDIENCE must be set")
	}
	return nil
}

func databaseURL() string {
	if raw := strings.TrimSpace(os.Getenv("PLATFORM_DATABASE_URL")); raw != "" {
		return raw
	}
	host := strings.TrimSpace(os.Getenv("PLATFORM_DATABASE_HOST"))
	user := strings.TrimSpace(os.Getenv("PLATFORM_DATABASE_USER"))
	password := strings.TrimSpace(os.Getenv("PLATFORM_DATABASE_PASSWORD"))
	name := value("PLATFORM_DATABASE_NAME", "app")
	if host == "" || user == "" || password == "" {
		return ""
	}
	dsn := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, password),
		Host:   net.JoinHostPort(host, "5432"),
		Path:   name,
	}
	query := dsn.Query()
	query.Set("sslmode", "require")
	dsn.RawQuery = query.Encode()
	return dsn.String()
}

func value(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func logLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
