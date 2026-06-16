package reconciler

import (
	"context"
	"fmt"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func (r *Reconciler) deploymentStatus(ctx context.Context, name string) (string, error) {
	deployment, err := r.client.Resource(schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "deployments",
	}).Namespace(r.cfg.AppsNamespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return "pending", nil
		}
		return "failed", fmt.Errorf("get deployment %s: %w", name, err)
	}

	desired, found, err := unstructured.NestedInt64(deployment.Object, "spec", "replicas")
	if err != nil {
		return "failed", fmt.Errorf("read deployment %s desired replicas: %w", name, err)
	}
	if !found {
		desired = 1
	}
	available, found, err := unstructured.NestedInt64(deployment.Object, "status", "availableReplicas")
	if err != nil {
		return "failed", fmt.Errorf("read deployment %s available replicas: %w", name, err)
	}
	if !found {
		available = 0
	}
	updated, found, err := unstructured.NestedInt64(deployment.Object, "status", "updatedReplicas")
	if err != nil {
		return "failed", fmt.Errorf("read deployment %s updated replicas: %w", name, err)
	}
	if !found {
		updated = 0
	}
	if available >= desired && updated >= desired {
		return "ready", nil
	}

	conditions, ok, _ := unstructured.NestedSlice(deployment.Object, "status", "conditions")
	if ok {
		for _, rawCondition := range conditions {
			condition, ok := rawCondition.(map[string]any)
			if !ok {
				continue
			}
			if condition["type"] == "Progressing" && condition["status"] == "False" {
				return "failed", nil
			}
		}
	}

	return "reconciling", nil
}

func (r *Reconciler) postgresStatus(ctx context.Context, name string, poolerEnabled bool) (string, error) {
	clusterStatus, err := r.postgresClusterStatus(ctx, name)
	if err != nil || clusterStatus != "ready" {
		return clusterStatus, err
	}

	databaseReady, err := r.postgresDatabaseApplied(ctx, name)
	if err != nil {
		return "failed", err
	}
	if !databaseReady {
		return "reconciling", nil
	}

	if poolerEnabled {
		poolerStatus, err := r.deploymentStatus(ctx, name+"-pooler-rw")
		if err != nil || poolerStatus != "ready" {
			return poolerStatus, err
		}
	}

	return "ready", nil
}

func (r *Reconciler) postgresClusterStatus(ctx context.Context, name string) (string, error) {
	cluster, err := r.client.Resource(schema.GroupVersionResource{
		Group:    "postgresql.cnpg.io",
		Version:  "v1",
		Resource: "clusters",
	}).Namespace(r.cfg.AppsNamespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return "pending", nil
		}
		return "failed", fmt.Errorf("get postgres cluster %s: %w", name, err)
	}

	conditions, ok, _ := unstructured.NestedSlice(cluster.Object, "status", "conditions")
	if ok {
		for _, rawCondition := range conditions {
			condition, ok := rawCondition.(map[string]any)
			if !ok || condition["type"] != "Ready" {
				continue
			}
			switch condition["status"] {
			case "True":
				return "ready", nil
			case "False":
				return "failed", nil
			}
		}
	}

	desired, found, err := unstructured.NestedInt64(cluster.Object, "spec", "instances")
	if err != nil {
		return "failed", fmt.Errorf("read postgres cluster %s desired instances: %w", name, err)
	}
	if !found {
		desired = 1
	}
	ready, found, err := unstructured.NestedInt64(cluster.Object, "status", "readyInstances")
	if err != nil {
		return "failed", fmt.Errorf("read postgres cluster %s ready instances: %w", name, err)
	}
	if found && ready >= desired {
		return "ready", nil
	}

	phase, _, _ := unstructured.NestedString(cluster.Object, "status", "phase")
	if strings.Contains(strings.ToLower(phase), "fail") {
		return "failed", nil
	}
	return "reconciling", nil
}

func (r *Reconciler) postgresDatabaseApplied(ctx context.Context, name string) (bool, error) {
	database, err := r.client.Resource(schema.GroupVersionResource{
		Group:    "postgresql.cnpg.io",
		Version:  "v1",
		Resource: "databases",
	}).Namespace(r.cfg.AppsNamespace).Get(ctx, name+"-database", metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return false, nil
		}
		return false, fmt.Errorf("get postgres database %s: %w", name, err)
	}
	applied, found, err := unstructured.NestedBool(database.Object, "status", "applied")
	if err != nil {
		return false, fmt.Errorf("read postgres database %s applied status: %w", name, err)
	}
	return found && applied, nil
}
