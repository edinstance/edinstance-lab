package telemetry

import (
	"context"
	"fmt"
	"time"

	"github.com/edinstance/edinstance-lab/services/platform-api/internal/config"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
)

func InitMetrics(ctx context.Context, cfg config.Config) (func(context.Context) error, error) {
	exporter, err := otlpmetrichttp.New(ctx, otlpmetrichttp.WithEndpointURL(cfg.OTLPEndpoint))
	if err != nil {
		return nil, fmt.Errorf("create otlp metric exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
		),
	)
	if err != nil {
		if shutdownErr := exporter.Shutdown(ctx); shutdownErr != nil {
			return nil, fmt.Errorf("create otel resource: %w; shutdown metric exporter: %v", err, shutdownErr)
		}
		return nil, fmt.Errorf("create otel resource: %w", err)
	}

	provider := metric.NewMeterProvider(
		metric.WithReader(metric.NewPeriodicReader(exporter, metric.WithInterval(10*time.Second))),
		metric.WithResource(res),
	)
	otel.SetMeterProvider(provider)

	return provider.Shutdown, nil
}
