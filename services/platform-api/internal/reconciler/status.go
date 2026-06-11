package reconciler

import (
	"context"
	"fmt"

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
	if !found || desired == 0 {
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
