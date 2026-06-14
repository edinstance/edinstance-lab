package reconciler

import (
	"sort"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func (r *Reconciler) secret(spec AppSpec) *unstructured.Unstructured {
	stringData := map[string]any{}
	keys := sortedEnvKeys(spec.Env)
	for _, key := range keys {
		stringData[key] = spec.Env[key]
	}

	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata":   r.metadata(spec.Name+"-env", spec.Name),
		"type":       "Opaque",
		"stringData": stringData,
	}}
}

func (r *Reconciler) deployment(spec AppSpec) *unstructured.Unstructured {
	env := r.deploymentEnv(spec)
	labels := r.labels(spec.Name)

	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata":   r.metadata(spec.Name, spec.Name),
		"spec": map[string]any{
			"replicas": spec.Replicas,
			"selector": map[string]any{
				"matchLabels": labels,
			},
			"template": map[string]any{
				"metadata": map[string]any{"labels": labels},
				"spec": map[string]any{
					"automountServiceAccountToken": false,
					"securityContext":              podSecurityContext(),
					"topologySpreadConstraints":    topologySpreadConstraints(labels),
					"affinity":                     podAntiAffinity(labels),
					"containers": []any{map[string]any{
						"name":            "app",
						"image":           spec.Image,
						"imagePullPolicy": "IfNotPresent",
						"ports": []any{map[string]any{
							"name":          "http",
							"containerPort": spec.Port,
						}},
						"env":            env,
						"resources":      containerResources(),
						"readinessProbe": readinessProbe(spec.HealthPath),
						"livenessProbe":  livenessProbe(spec.HealthPath),
						"securityContext": map[string]any{
							"allowPrivilegeEscalation": false,
							"readOnlyRootFilesystem":   true,
							"capabilities": map[string]any{
								"drop": []any{"ALL"},
							},
						},
					}},
				},
			},
		},
	}}
}

func (r *Reconciler) deploymentEnv(spec AppSpec) []any {
	env := []any{
		map[string]any{"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": r.cfg.OTLPEndpoint},
		map[string]any{"name": "OTEL_SERVICE_NAME", "value": spec.Name},
	}
	for _, key := range sortedEnvKeys(spec.Env) {
		env = append(env, map[string]any{
			"name": key,
			"valueFrom": map[string]any{
				"secretKeyRef": map[string]any{
					"name": spec.Name + "-env",
					"key":  key,
				},
			},
		})
	}
	return env
}

func (r *Reconciler) service(spec AppSpec) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Service",
		"metadata":   r.metadata(spec.Name, spec.Name),
		"spec": map[string]any{
			"selector": r.labels(spec.Name),
			"ports": []any{map[string]any{
				"name":       "http",
				"port":       int64(80),
				"targetPort": "http",
			}},
		},
	}}
}

func (r *Reconciler) httpRoute(spec AppSpec) *unstructured.Unstructured {
	hostnames := make([]any, 0, len(spec.Domains))
	for _, domain := range spec.Domains {
		hostnames = append(hostnames, domain)
	}
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "gateway.networking.k8s.io/v1",
		"kind":       "HTTPRoute",
		"metadata":   r.metadata(spec.Name, spec.Name),
		"spec": map[string]any{
			"parentRefs": gatewayParentRefs(r.cfg.GatewayName, r.cfg.GatewayNamespace),
			"hostnames":  hostnames,
			"rules": []any{map[string]any{
				"backendRefs": []any{map[string]any{
					"name": spec.Name,
					"port": int64(80),
				}},
			}},
		},
	}}
}

func gatewayParentRefs(name, namespace string) []any {
	refs := make([]any, 0, 3)
	for _, sectionName := range []string{"http-local", "https-local", "http-public"} {
		refs = append(refs, map[string]any{
			"name":        name,
			"namespace":   namespace,
			"sectionName": sectionName,
		})
	}
	return refs
}

func (r *Reconciler) networkPolicy(spec AppSpec) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "networking.k8s.io/v1",
		"kind":       "NetworkPolicy",
		"metadata":   r.metadata(spec.Name, spec.Name),
		"spec": map[string]any{
			"podSelector": map[string]any{"matchLabels": r.labels(spec.Name)},
			"policyTypes": []any{
				"Ingress",
				"Egress",
			},
			"ingress": []any{map[string]any{
				"from": []any{
					namespaceSelector(r.cfg.GatewayNamespace),
					namespaceSelector("cloudflare-tunnel"),
				},
				"ports": []any{map[string]any{"protocol": "TCP", "port": spec.Port}},
			}},
			"egress": []any{
				map[string]any{
					"to": []any{namespaceSelector("kube-system")},
					"ports": []any{
						map[string]any{"protocol": "UDP", "port": int64(53)},
						map[string]any{"protocol": "TCP", "port": int64(53)},
					},
				},
				map[string]any{
					"to": []any{namespaceSelector("opentelemetry")},
					"ports": []any{
						map[string]any{"protocol": "TCP", "port": int64(4317)},
						map[string]any{"protocol": "TCP", "port": int64(4318)},
					},
				},
				map[string]any{
					"to": []any{namespaceSelector("platform-db")},
					"ports": []any{
						map[string]any{"protocol": "TCP", "port": int64(5432)},
					},
				},
			},
		},
	}}
}

func (r *Reconciler) metadata(name string, appName string) map[string]any {
	return map[string]any{
		"name":      name,
		"namespace": r.cfg.AppsNamespace,
		"labels":    r.labels(appName),
	}
}

func (r *Reconciler) labels(appName string) map[string]any {
	return map[string]any{
		"app.kubernetes.io/name":       appName,
		"app.kubernetes.io/managed-by": "edinstance-platform",
	}
}

func sortedEnvKeys(env map[string]string) []string {
	keys := make([]string, 0, len(env))
	for key := range env {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func namespaceSelector(namespace string) map[string]any {
	return map[string]any{
		"namespaceSelector": map[string]any{
			"matchLabels": map[string]any{
				"kubernetes.io/metadata.name": namespace,
			},
		},
	}
}

func podSecurityContext() map[string]any {
	return map[string]any{
		"runAsNonRoot": true,
		"runAsUser":    int64(65532),
		"runAsGroup":   int64(65532),
		"seccompProfile": map[string]any{
			"type": "RuntimeDefault",
		},
	}
}

func containerResources() map[string]any {
	return map[string]any{
		"requests": map[string]any{"cpu": "50m", "memory": "64Mi"},
		"limits":   map[string]any{"cpu": "250m", "memory": "256Mi"},
	}
}

func topologySpreadConstraints(labels map[string]any) []any {
	return []any{map[string]any{
		"maxSkew":           int64(1),
		"topologyKey":       "kubernetes.io/hostname",
		"whenUnsatisfiable": "DoNotSchedule",
		"labelSelector":     map[string]any{"matchLabels": labels},
	}}
}

func podAntiAffinity(labels map[string]any) map[string]any {
	return map[string]any{
		"podAntiAffinity": map[string]any{
			"preferredDuringSchedulingIgnoredDuringExecution": []any{map[string]any{
				"weight": int64(100),
				"podAffinityTerm": map[string]any{
					"topologyKey":   "kubernetes.io/hostname",
					"labelSelector": map[string]any{"matchLabels": labels},
				},
			}},
		},
	}
}

func readinessProbe(path string) map[string]any {
	return map[string]any{
		"httpGet":             map[string]any{"path": path, "port": "http"},
		"initialDelaySeconds": int64(5),
		"periodSeconds":       int64(10),
	}
}

func livenessProbe(path string) map[string]any {
	return map[string]any{
		"httpGet":             map[string]any{"path": path, "port": "http"},
		"initialDelaySeconds": int64(20),
		"periodSeconds":       int64(20),
	}
}
