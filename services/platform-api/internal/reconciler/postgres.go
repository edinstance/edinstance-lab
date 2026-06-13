package reconciler

import "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

func (r *Reconciler) postgresSecret(spec PostgresSpec) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1", "kind": "Secret",
		"metadata":   map[string]any{"name": spec.Name + "-app", "namespace": spec.Namespace},
		"type":       "kubernetes.io/basic-auth",
		"stringData": map[string]any{"username": spec.Owner, "password": spec.Password},
	}}
}

func (r *Reconciler) postgresCluster(spec PostgresSpec) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "postgresql.cnpg.io/v1", "kind": "Cluster",
		"metadata": map[string]any{"name": spec.Name, "namespace": spec.Namespace},
		"spec": map[string]any{
			"instances":             spec.Instances,
			"imageName":             "ghcr.io/cloudnative-pg/postgresql:" + spec.Version,
			"primaryUpdateStrategy": "unsupervised",
			"bootstrap": map[string]any{"initdb": map[string]any{
				"database": spec.Database, "owner": spec.Owner,
				"secret": map[string]any{"name": spec.Name + "-app"},
			}},
			"storage":    map[string]any{"size": spec.StorageSize, "storageClass": "longhorn"},
			"monitoring": map[string]any{"enablePodMonitor": true},
			"affinity":   map[string]any{"enablePodAntiAffinity": true, "topologyKey": "kubernetes.io/hostname"},
			"resources": map[string]any{
				"requests": map[string]any{"cpu": "100m", "memory": "512Mi"},
				"limits":   map[string]any{"cpu": "1", "memory": "2Gi"},
			},
		},
	}}
}

func (r *Reconciler) postgresDatabase(spec PostgresSpec) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "postgresql.cnpg.io/v1", "kind": "Database",
		"metadata": map[string]any{"name": spec.Name + "-database", "namespace": spec.Namespace},
		"spec": map[string]any{
			"name": spec.Database, "owner": spec.Owner,
			"cluster":               map[string]any{"name": spec.Name},
			"databaseReclaimPolicy": "retain",
		},
	}}
}

func (r *Reconciler) postgresPooler(spec PostgresSpec) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "postgresql.cnpg.io/v1", "kind": "Pooler",
		"metadata": map[string]any{"name": spec.Name + "-pooler-rw", "namespace": spec.Namespace},
		"spec": map[string]any{
			"cluster": map[string]any{"name": spec.Name}, "instances": spec.PoolerInstances, "type": "rw",
			"monitoring": map[string]any{"enablePodMonitor": true},
			"pgbouncer": map[string]any{
				"poolMode":   spec.PoolMode,
				"parameters": map[string]any{"max_client_conn": "1000", "default_pool_size": "20"},
			},
		},
	}}
}

func (r *Reconciler) postgresPublicService(spec PostgresSpec) *unstructured.Unstructured {
	serviceSpec := map[string]any{
		"type": "LoadBalancer", "externalTrafficPolicy": "Local",
		"selector": map[string]any{
			"cnpg.io/podRole":    "pooler",
			"cnpg.io/poolerName": spec.Name + "-pooler-rw",
		},
		"ports": []any{map[string]any{
			"name": "postgresql", "protocol": "TCP", "port": int64(5432), "targetPort": int64(5432),
		}},
	}
	if len(spec.PublicSourceCIDRs) > 0 {
		serviceSpec["loadBalancerSourceRanges"] = spec.PublicSourceCIDRs
	}
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1", "kind": "Service",
		"metadata": map[string]any{
			"name": spec.Name + "-public", "namespace": spec.Namespace,
			"annotations": map[string]any{
				"external-dns.alpha.kubernetes.io/hostname": spec.PublicHostname,
				"platform.edinstance.uk/exposure":           "public-postgresql",
			},
		},
		"spec": serviceSpec,
	}}
}
