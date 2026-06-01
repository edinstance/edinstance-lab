# Kubernetes Backup Notes

This repo includes an Ansible backup playbook:

```text
ansible/playbooks/90-backup-control-plane.yml
```

It is intended for kubeadm control-plane recovery material. It does not back up application persistent volumes.

## Run It

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/90-backup-control-plane.yml
```

Backups are fetched to the admin machine under:

```text
backups/YYYYMMDDTHHMMSSZ/
```

The `backups/` directory is ignored by git because it contains private keys and admin credentials.

## What It Backs Up

From each control-plane node, the playbook archives any of these paths that exist:

```text
/etc/kubernetes/pki
/etc/kubernetes/admin.conf
/etc/kubernetes/manifests
/var/lib/kubelet/config.yaml
```

These are stored as:

```text
<node>-control-plane-files-<timestamp>.tar.gz
```

The playbook also tries to create an etcd snapshot from the first control-plane node:

```text
<node>-etcd-snapshot-<timestamp>.db
```

The etcd snapshot is only created if `etcdctl` exists on that node and the kubeadm etcd certificates are present.

## Why These Files Matter

`/etc/kubernetes/pki` contains the cluster certificate authority, service account keys, API server certificates, front-proxy certificates, and etcd certificates. These files define the cluster's identity. Losing them makes clean recovery much harder.

`/etc/kubernetes/admin.conf` is the admin kubeconfig. It gives break-glass access to the cluster.

`/etc/kubernetes/manifests` contains static pod manifests for kubeadm control-plane components and kube-vip. These files define how the API server, scheduler, controller manager, etcd, and kube-vip are launched on the node.

`/var/lib/kubelet/config.yaml` records kubelet configuration used by the node.

The etcd snapshot is the actual Kubernetes control-plane database. It contains Kubernetes objects such as nodes, namespaces, deployments, services, secrets, configmaps, and cluster state.

## Important Distinction

The file archive and the etcd snapshot solve different problems.

The file archive preserves credentials, certificates, manifests, and kubelet config.

The etcd snapshot preserves Kubernetes state.

For meaningful control-plane recovery, you want both.

## Security

Treat everything in `backups/` as secret.

The backup may contain:

- Kubernetes CA private keys.
- etcd private keys.
- service account signing keys.
- admin kubeconfig credentials.
- Kubernetes Secrets inside the etcd snapshot.

Do not commit it. Do not upload it to unencrypted storage. If copying it elsewhere, encrypt it first.

## When To Run It

Run the backup:

- after the cluster is successfully bootstrapped
- before Kubernetes upgrades
- before control-plane certificate work
- before changing kube-vip, Cilium, or etcd-related configuration
- after adding or removing control-plane nodes

## What It Does Not Back Up

This playbook does not back up persistent volumes.

Persistent volume backup depends on the storage backend. For example:

- local-path-provisioner needs host-path or filesystem-level backup.
- Longhorn has its own recurring backup model.
- Rook/Ceph needs Ceph-aware backup planning.
- NAS-backed storage may need snapshots on the NAS.

Choose the storage backend before designing persistent application backup.

## Restore Notes

Restoring kubeadm control-plane state is a careful operation and depends on what failed.

Typical uses:

- recover `admin.conf` if local kubeconfig is lost
- inspect or restore static pod manifests
- recover certificate material during a control-plane rebuild
- restore etcd state during full control-plane disaster recovery

Do not restore these files over a running healthy cluster without a specific recovery plan.

For etcd disaster recovery, follow the kubeadm and etcd restore process for the Kubernetes version in use, using the snapshot fetched by this playbook.

## Verify A Backup Exists

```bash
find backups -maxdepth 2 -type f -print
```

Expected examples:

```text
backups/20260528T010000Z/k8s-1-control-plane-files-20260528T010000Z.tar.gz
backups/20260528T010000Z/k8s-2-control-plane-files-20260528T010000Z.tar.gz
backups/20260528T010000Z/k8s-3-control-plane-files-20260528T010000Z.tar.gz
backups/20260528T010000Z/k8s-1-etcd-snapshot-20260528T010000Z.db
```

## Inspect A File Archive

```bash
tar -tzf backups/<timestamp>/<node>-control-plane-files-<timestamp>.tar.gz
```

Do not paste archive contents into tickets, chats, or logs. The file names are usually safe to inspect; the file contents are sensitive.
