package reconciler

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

func (r *Reconciler) ensureNamespace(ctx context.Context) error {
	ns := &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": "v1",
			"kind":       "Namespace",
			"metadata": map[string]any{
				"name": r.cfg.AppsNamespace,
				"labels": map[string]any{
					"app.kubernetes.io/managed-by": "edinstance-platform",
				},
			},
		},
	}
	return r.apply(ctx, ns)
}

func (r *Reconciler) apply(ctx context.Context, obj *unstructured.Unstructured) error {
	data, err := obj.MarshalJSON()
	if err != nil {
		return fmt.Errorf("marshal %s/%s: %w", obj.GetKind(), obj.GetName(), err)
	}
	gvr, err := gvrFor(obj)
	if err != nil {
		return err
	}
	_, err = r.client.Resource(gvr).Namespace(namespaceFor(obj)).Patch(
		ctx,
		obj.GetName(),
		types.ApplyPatchType,
		data,
		metav1.PatchOptions{FieldManager: fieldManager},
	)
	if err != nil {
		return fmt.Errorf("apply %s/%s: %w", obj.GetKind(), obj.GetName(), err)
	}
	return nil
}

func kubeRESTConfig(kubeconfig string) (*rest.Config, error) {
	if strings.TrimSpace(kubeconfig) != "" {
		return clientcmd.BuildConfigFromFlags("", kubeconfig)
	}
	if home := os.Getenv("HOME"); home != "" {
		path := filepath.Join(home, ".kube", "config")
		if _, err := os.Stat(path); err == nil {
			return clientcmd.BuildConfigFromFlags("", path)
		}
	}
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("load Kubernetes config: %w", err)
	}
	return cfg, nil
}

func gvrFor(obj *unstructured.Unstructured) (schema.GroupVersionResource, error) {
	switch obj.GetKind() {
	case "Namespace":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}, nil
	case "Secret":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}, nil
	case "Service":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}, nil
	case "Deployment":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}, nil
	case "NetworkPolicy":
		return schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}, nil
	case "HTTPRoute":
		return schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "httproutes"}, nil
	default:
		return schema.GroupVersionResource{}, fmt.Errorf("unsupported Kubernetes kind %q", obj.GetKind())
	}
}

func namespaceFor(obj *unstructured.Unstructured) string {
	if obj.GetKind() == "Namespace" {
		return ""
	}
	return obj.GetNamespace()
}
