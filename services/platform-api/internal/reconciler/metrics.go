package reconciler

import (
	"context"
	"database/sql"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
)

type reconciliationMetrics struct {
	attempts metric.Int64Counter
	failures metric.Int64Counter
}

func newReconciliationMetrics(db countQuerier) (reconciliationMetrics, error) {
	meter := otel.Meter("platform-api/reconciler")
	attempts, err := meter.Int64Counter("platform.reconciliation.attempts")
	if err != nil {
		return reconciliationMetrics{}, err
	}
	failures, err := meter.Int64Counter("platform.reconciliation.failures")
	if err != nil {
		return reconciliationMetrics{}, err
	}
	pending, err := meter.Int64ObservableGauge("platform.reconciliation.pending")
	if err != nil {
		return reconciliationMetrics{}, err
	}
	divergent, err := meter.Int64ObservableGauge("platform.reconciliation.divergent")
	if err != nil {
		return reconciliationMetrics{}, err
	}
	_, err = meter.RegisterCallback(func(ctx context.Context, observer metric.Observer) error {
		var pendingCount, divergentCount int64
		if err := db.QueryRowContext(ctx, `select count(*) from services where reconcile_state in ('pending', 'failed', 'deleting')`).Scan(&pendingCount); err != nil {
			return fmt.Errorf("count pending reconciliations: %w", err)
		}
		if err := db.QueryRowContext(ctx, `select count(*) from services where desired_generation <> reconciled_generation or reconcile_state in ('pending', 'reconciling', 'failed', 'deleting')`).Scan(&divergentCount); err != nil {
			return fmt.Errorf("count divergent services: %w", err)
		}
		observer.ObserveInt64(pending, pendingCount)
		observer.ObserveInt64(divergent, divergentCount)
		return nil
	}, pending, divergent)
	if err != nil {
		return reconciliationMetrics{}, err
	}
	return reconciliationMetrics{attempts: attempts, failures: failures}, nil
}

type countQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}
