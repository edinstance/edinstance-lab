# Storage Plan

Use Longhorn as the default storage backend for this three-node homelab cluster.

Longhorn is a good fit here because all three nodes are both control-plane and schedulable worker nodes. It can replicate persistent volumes across nodes without requiring a separate NAS or the operational weight of Ceph.

## Chosen Backend

```text
Backend: Longhorn
Chart: longhorn/longhorn
Pinned chart version: 1.11.2
Namespace: longhorn-system
Default data path: /var/lib/longhorn
Default replica count: 3
```

The values file is:

```text
kubernetes/addons/longhorn/values.yml
```

The pinned Helm release is in:

```text
helmfile.yaml
```

## Why Longhorn

Longhorn gives the cluster a real `StorageClass` for stateful workloads. With three replicas, a volume can survive one node failure while the cluster remains available.

It also provides snapshots and backup features, which are the right place to handle persistent-volume backup once an external backup target is chosen.

## Node Expectations

Each node should have enough stable local disk for the workloads you intend to run.

Recommended before installing:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m shell -a 'df -h /var/lib && lsblk'
```

Longhorn will use:

```text
/var/lib/longhorn
```

Keep this on reliable storage. Avoid tiny boot disks if you expect to run databases or monitoring.

## Install

Do not install Longhorn until the cluster is healthy and all three nodes are `Ready`.

Install with Helm directly:

```bash
helm repo add longhorn https://charts.longhorn.io
helm repo update
helm upgrade --install longhorn longhorn/longhorn \
  --namespace longhorn-system \
  --create-namespace \
  --version 1.11.2 \
  --values kubernetes/addons/longhorn/values.yml
```

Or with Helmfile:

```bash
helmfile sync --selector name=longhorn
```

## Verify

```bash
kubectl -n longhorn-system get pods
kubectl get storageclass
```

Expected:

```text
Longhorn pods Running
longhorn StorageClass present
longhorn marked as the default StorageClass
```

## Backups

The existing control-plane backup playbook does not back up Longhorn volumes.

For real workloads, configure a Longhorn backup target. Good options are:

- S3-compatible object storage.
- NFS share on a NAS.
- Another durable external storage target.

Until that is configured, Longhorn protects against a node or disk failure through replication, but it does not protect against accidental deletion, cluster-wide failure, or site loss.

## Operational Notes

Use three replicas for important workloads while the cluster has three nodes.

For disposable workloads, a lower replica count is acceptable per-volume, but do not change the default until there is a clear reason.

Before rebooting or draining a node, check Longhorn volume health in addition to Kubernetes pod health.

Do not run database workloads until Longhorn is installed, healthy, and backup target planning is complete.
