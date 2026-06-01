# Infrastructure TODO

## Done

- [x] Pin Kubernetes package versions instead of installing the latest package from the minor repository.
- [x] Pin `kubernetesVersion` in `kubernetes/bootstrap/kubeadm-config.yml` instead of using `stable`.
- [x] Pin Helm chart versions for Cilium, MetalLB, metrics-server, and Envoy Gateway.
- [x] Automate kube-vip static pod generation with Ansible.
- [x] Add backup steps for `/etc/kubernetes/pki`, kubeconfig, and control-plane state.
- [x] Add a storage plan before stateful workloads, using Longhorn.
- [x] Add DNS documentation for public `*.lab.edinstance.com` and local `*.local.edinstance.com` service names.
- [x] Add Cloudflare Tunnel manifests and documentation for public `*.lab.edinstance.com` access.
- [x] Add SOPS + age secrets management docs and examples.
- [x] Add cert-manager DNS-01 plan for `*.local.edinstance.com`.
- [x] Add GitOps plan using Flux after secrets/TLS settle.
- [x] Update GitOps plan for a custom Railway-like control plane.
- [x] Add Flux bootstrap resource structure.
- [x] Add Flux Kustomizations for addons, platform CRDs, and apps.
- [x] Add observability addon manifests for Prometheus, Grafana, and Alertmanager.
- [x] Add OpenTelemetry Collector addon manifests.
- [x] Add an app template structure for manually onboarded services.
- [x] Add the initial `platform.edinstance.com/v1alpha1` `App` CRD and whoami example.
- [x] Decide whether `ansible/inventory.ini` should represent one active node or the planned three-node control plane.
- [x] Add worker-node inventory groups for the three schedulable control-plane nodes.

## Pending

- [ ] Add backup steps for future persistent storage after the storage backend is chosen.
- [ ] Configure a Longhorn backup target before important stateful workloads.
- [ ] Replace `.sops.yaml` placeholder with the real age public key.
- [ ] Create and encrypt the real Cloudflare API token secret.
- [ ] Add HTTPS listeners to Envoy Gateway after the local wildcard certificate is issued.
- [ ] Add DNS automation later if manual UniFi/provider records become annoying.
- [ ] Install Flux controllers in the cluster.
- [ ] Set the real Git repository URL in `kubernetes/addons/flux/source.yml`.
- [ ] Create the Flux deploy key secret named `flux-system`.
- [ ] Create the real `grafana-admin` secret or SOPS-encrypted equivalent.
- [ ] Convert the existing base addons from Helmfile to Flux `HelmRelease` resources.
- [ ] Move `whoami` fully into the generated app shape once the controller exists.
- [ ] Build a minimal platform API that creates and updates `App` resources.
- [ ] Build the first control-plane UI for app list, create, deploy status, env, and logs.
- [ ] Build the first controller loop that renders Kubernetes resources from `App`.
