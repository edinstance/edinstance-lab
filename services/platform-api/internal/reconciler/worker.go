package reconciler

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

const (
	workerPollInterval = 2 * time.Second
	reconcileTimeout   = 45 * time.Second
	leaseDuration      = 2 * reconcileTimeout
)

type workItem struct {
	ID         string
	Name       string
	Generation int64
	State      string
	Attempts   int
}

func (r *Reconciler) Run(ctx context.Context) error {
	ticker := time.NewTicker(workerPollInterval)
	defer ticker.Stop()

	for {
		worked, err := r.processNext(ctx)
		if err != nil && !errors.Is(err, context.Canceled) {
			slog.ErrorContext(ctx, "reconciliation worker iteration failed", "error", err)
		}
		if worked {
			continue
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (r *Reconciler) processNext(ctx context.Context) (bool, error) {
	item, err := r.claimNext(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	workCtx, cancel := context.WithTimeout(ctx, reconcileTimeout)
	defer cancel()

	operation := "apply"
	if item.State == "deleting" {
		operation = "delete"
		err = r.DeleteApp(workCtx, item.Name)
	} else {
		err = r.ReconcileApp(workCtx, item.Name)
	}
	r.metrics.attempts.Add(ctx, 1, metric.WithAttributes(attribute.String("operation", operation)))
	if err != nil {
		r.metrics.failures.Add(ctx, 1, metric.WithAttributes(attribute.String("operation", operation)))
		return true, r.recordFailure(ctx, item, err)
	}
	if item.State == "deleting" {
		_, err = r.db.ExecContext(ctx, "delete from services where id = $1::uuid and reconcile_state = 'deleting'", item.ID)
		return true, err
	}
	_, err = r.db.ExecContext(ctx, `
		update services
		set reconciled_generation = $2,
			reconcile_state = case when desired_generation = $2 then 'ready' else 'pending' end,
			status = case when desired_generation = $2 then 'reconciling' else status end,
			reconcile_attempts = case when desired_generation = $2 then 0 else reconcile_attempts end,
			next_reconcile_at = case when desired_generation = $2 then now() + interval '1 minute' else now() end,
			last_reconcile_error = null, reconcile_lease_until = null, updated_at = now()
		where id = $1::uuid
	`, item.ID, item.Generation)
	return true, err
}

func (r *Reconciler) claimNext(ctx context.Context) (workItem, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return workItem{}, fmt.Errorf("begin reconciliation claim: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var item workItem
	err = tx.QueryRowContext(ctx, `
		select id::text, name, desired_generation, reconcile_state, reconcile_attempts
		from services
		where reconcile_state in ('pending', 'failed', 'deleting', 'reconciling', 'ready')
			and next_reconcile_at <= now()
			and (reconcile_lease_until is null or reconcile_lease_until < now())
		order by next_reconcile_at, created_at
		for update skip locked
		limit 1
	`).Scan(&item.ID, &item.Name, &item.Generation, &item.State, &item.Attempts)
	if err != nil {
		return workItem{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		update services set reconcile_lease_until = now() + ($2 * interval '1 second'),
			reconcile_state = case when reconcile_state = 'deleting' then 'deleting' else 'reconciling' end
		where id = $1::uuid
	`, item.ID, int(leaseDuration.Seconds())); err != nil {
		return workItem{}, fmt.Errorf("lease reconciliation item: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return workItem{}, fmt.Errorf("commit reconciliation claim: %w", err)
	}
	return item, nil
}

func (r *Reconciler) recordFailure(ctx context.Context, item workItem, reconcileErr error) error {
	attempts := item.Attempts + 1
	nextAttempt := time.Now().Add(retryDelay(attempts))
	state := "failed"
	if item.State == "deleting" {
		state = "deleting"
	}
	_, err := r.db.ExecContext(ctx, `
		update services
		set reconcile_state = $2, status = 'failed', reconcile_attempts = $3, next_reconcile_at = $4,
			last_reconcile_error = $5, reconcile_lease_until = null, updated_at = now()
		where id = $1::uuid
	`, item.ID, state, attempts, nextAttempt, reconcileErr.Error())
	if err != nil {
		return fmt.Errorf("record reconciliation failure after %v: %w", reconcileErr, err)
	}
	return nil
}

func retryDelay(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 8 {
		attempts = 8
	}
	delay := time.Duration(1<<attempts) * time.Second
	if delay > 5*time.Minute {
		return 5 * time.Minute
	}
	return delay
}
