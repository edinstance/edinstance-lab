package reconciler

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/edinstance/edinstance-lab/services/platform-api/internal/config"
	"github.com/edinstance/edinstance-lab/services/platform-api/internal/platformdb"
	platformsecrets "github.com/edinstance/edinstance-lab/services/platform-api/internal/secrets"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

const fieldManager = "edinstance-platform-api"

type Reconciler struct {
	db     *platformdb.DB
	cipher *platformsecrets.Cipher
	client dynamic.Interface
	cfg    config.Config
}

type AppSpec struct {
	Name     string
	Image    string
	Port     int
	Replicas int
	Domains  []string
	Env      map[string]string
}

func New(ctx context.Context, cfg config.Config, db *platformdb.DB, cipher *platformsecrets.Cipher) (*Reconciler, error) {
	if db == nil {
		return nil, fmt.Errorf("database is required")
	}
	if cipher == nil {
		return nil, fmt.Errorf("secret cipher is required")
	}
	restConfig, err := kubeRESTConfig(cfg.Kubeconfig)
	if err != nil {
		return nil, err
	}
	client, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create dynamic Kubernetes client: %w", err)
	}
	reconciler := &Reconciler{
		db:     db,
		cipher: cipher,
		client: client,
		cfg:    cfg,
	}
	return reconciler, nil
}

func (r *Reconciler) ReconcileApp(ctx context.Context, name string) error {
	spec, err := r.loadAppSpec(ctx, name)
	if err != nil {
		return err
	}
	resources := []*unstructured.Unstructured{
		r.secret(spec),
		r.service(spec),
		r.deployment(spec),
		r.networkPolicy(spec),
	}
	if len(spec.Domains) > 0 {
		resources = append(resources, r.httpRoute(spec))
	}

	for _, resource := range resources {
		if err := r.apply(ctx, resource); err != nil {
			if _, execErr := r.db.ExecContext(ctx, "update services set status = 'failed', updated_at = now() where name = $1", name); execErr != nil {
				slog.WarnContext(ctx, "failed to persist failed reconciliation status", "name", name, "error", execErr)
			}
			return err
		}
	}
	_, err = r.db.ExecContext(ctx, "update services set status = 'reconciling', updated_at = now() where name = $1", name)
	return err
}

func (r *Reconciler) RefreshAllStatuses(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, "select name from services order by name asc")
	if err != nil {
		return fmt.Errorf("list services for status refresh: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		if err := r.RefreshAppStatus(ctx, name); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (r *Reconciler) RefreshAppStatus(ctx context.Context, name string) error {
	status, err := r.deploymentStatus(ctx, name)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, "update services set status = $1, updated_at = now() where name = $2", status, name)
	return err
}

func (r *Reconciler) DeleteApp(ctx context.Context, name string) error {
	resources := []struct {
		gvr       schema.GroupVersionResource
		namespace string
		name      string
	}{
		{schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "httproutes"}, r.cfg.AppsNamespace, name},
		{schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}, r.cfg.AppsNamespace, name},
		{schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}, r.cfg.AppsNamespace, name},
		{schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}, r.cfg.AppsNamespace, name},
		{schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}, r.cfg.AppsNamespace, name + "-env"},
	}
	for _, resource := range resources {
		err := r.client.Resource(resource.gvr).Namespace(resource.namespace).Delete(ctx, resource.name, metav1.DeleteOptions{})
		if err != nil && !apierrors.IsNotFound(err) {
			return fmt.Errorf("delete %s/%s: %w", resource.gvr.Resource, resource.name, err)
		}
	}
	return nil
}
