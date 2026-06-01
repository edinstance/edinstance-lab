> Historical draft: the committed playbooks and manifests are authoritative.
> Trust `ansible/group_vars/all.yml`, `ansible/playbooks/02-kubernetes-packages.yml`,
> and `kubernetes/bootstrap/kubeadm-config.yml` when this file differs.

Great. Assuming your Ubiquiti network is now set up with reserved/static IPs for the nodes and DHCP no longer overlaps with the Kubernetes VIP/MetalLB range, the next steps are:

```text
1. Verify node networking
2. Set up SSH access
3. Create the repo structure
4. Install Ansible on your Mac
5. Run OS preparation playbook
6. Install containerd
7. Install kubeadm/kubelet/kubectl
8. Bootstrap the first control-plane node
9. Join the other nodes
10. Install Cilium
11. Install MetalLB
12. Install Envoy Gateway
13. Deploy a test app
```

Below is the practical path.

---

## 0. Assumed IP Plan

I will assume you used this plan:

```text
k8s-1:              192.168.2.10
k8s-2:              192.168.2.11
k8s-3:              192.168.2.12

Kubernetes API VIP: 192.168.2.80
MetalLB pool:       192.168.2.100-192.168.2.149
Envoy ingress IP:   192.168.2.100
Domain:             k8s.lan
```

If any of those differ, tell me before you run the bootstrap steps.

---

# Step 1: Verify Basic Node Networking

From your Mac, check that each node responds:

```bash
ping 192.168.2.10
ping 192.168.2.11
ping 192.168.2.12
```

If you created local DNS records, also test:

```bash
ping k8s-1.k8s.lan
ping k8s-2.k8s.lan
ping k8s-3.k8s.lan
```

If DNS does not work yet, that is okay. We can use IP addresses for Ansible.

---

# Step 2: Set Hostnames on the Ubuntu Nodes

On each Ubuntu machine, set the correct hostname.

On node 1:

```bash
sudo hostnamectl set-hostname k8s-1
```

On node 2:

```bash
sudo hostnamectl set-hostname k8s-2
```

On node 3:

```bash
sudo hostnamectl set-hostname k8s-3
```

Then either reboot each machine or log out/in.

Check:

```bash
hostname
```

Expected:

```text
k8s-1
```

or:

```text
k8s-2
```

or:

```text
k8s-3
```

---

# Step 3: Enable SSH on Each Ubuntu Node

On each Ubuntu node:

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
```

Check the SSH service:

```bash
sudo systemctl status ssh
```

---

# Step 4: Add Your Mac SSH Key to Each Node

On your Mac, if you do not already have an SSH key:

```bash
ssh-keygen -t ed25519 -C "homelab"
```

Then copy your key to each node.

Replace `ubuntu` with your actual Ubuntu username if different:

```bash
ssh-copy-id ubuntu@192.168.2.10
ssh-copy-id ubuntu@192.168.2.11
ssh-copy-id ubuntu@192.168.2.12
```

Test SSH:

```bash
ssh ubuntu@192.168.2.10 hostname
ssh ubuntu@192.168.2.11 hostname
ssh ubuntu@192.168.2.12 hostname
```

Expected:

```text
k8s-1
k8s-2
k8s-3
```

---

# Step 5: Install Local Tools on Your Mac

Install Ansible, Helm, kubectl, and Helmfile:

```bash
brew install ansible kubectl helm helmfile
```

Optional but useful:

```bash
brew install yq jq
```

Check versions:

```bash
ansible --version
kubectl version --client
helm version
helmfile --version
```

---

# Step 6: Create the Repo

On your Mac:

```bash
mkdir -p homelab-platform
cd homelab-platform
```

Create the directories:

```bash
mkdir -p config
mkdir -p ansible/group_vars
mkdir -p ansible/playbooks
mkdir -p kubernetes/bootstrap
mkdir -p kubernetes/addons/cilium
mkdir -p kubernetes/addons/metrics-server
mkdir -p kubernetes/addons/metallb
mkdir -p kubernetes/addons/envoy-gateway
mkdir -p charts/service/templates
mkdir -p apps/whoami
```

---

# Step 7: Create the Ansible Inventory

Create:

```bash
nano ansible/inventory.ini
```

Add:

```ini
[k8s_control_plane]
k8s-1 ansible_host=192.168.2.10
k8s-2 ansible_host=192.168.2.11
k8s-3 ansible_host=192.168.2.12

[k8s_nodes:children]
k8s_control_plane

[k8s_nodes:vars]
ansible_user=ubuntu
ansible_become=true
```

If your Ubuntu username is not `ubuntu`, change this line:

```ini
ansible_user=ubuntu
```

For example:

```ini
ansible_user=james
```

Test Ansible:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

Expected:

```text
k8s-1 | SUCCESS
k8s-2 | SUCCESS
k8s-3 | SUCCESS
```

Do not continue until this works.

---

# Step 8: Create Ansible Variables

Create:

```bash
nano ansible/group_vars/all.yaml
```

Add:

```yaml
kubernetes_version_minor: "1.36"
kubernetes_version: "1.36.1"
kubernetes_deb_version: "1.36.1-1.1"

cluster_name: homelab
cluster_domain: cluster.local

lan_subnet: 192.168.2.0/24
lan_gateway: 192.168.2.1
lan_domain: k8s.lan

k8s_api_vip: 192.168.2.80
k8s_api_dns_name: k8s-api.k8s.lan

pod_subnet: 10.244.0.0/16
service_subnet: 10.96.0.0/12

metallb_pool: 192.168.2.100-192.168.2.149
envoy_ingress_ip: 192.168.2.100
```

---

# Step 9: Run OS Prerequisites

Create the playbook:

```bash
nano ansible/playbooks/00-os-prereqs.yaml
```

Add:

```yaml
---
- name: Configure OS prerequisites for Kubernetes
  hosts: k8s_nodes
  become: true

  tasks:
    - name: Update apt cache
      ansible.builtin.apt:
        update_cache: true

    - name: Upgrade packages
      ansible.builtin.apt:
        upgrade: dist

    - name: Disable swap immediately
      ansible.builtin.command: swapoff -a
      changed_when: false

    - name: Disable swap in fstab
      ansible.builtin.replace:
        path: /etc/fstab
        regexp: '^([^#].*\sswap\s.*)$'
        replace: '# \1'

    - name: Load overlay module
      community.general.modprobe:
        name: overlay
        state: present

    - name: Load br_netfilter module
      community.general.modprobe:
        name: br_netfilter
        state: present

    - name: Persist kernel modules
      ansible.builtin.copy:
        dest: /etc/modules-load.d/k8s.conf
        mode: "0644"
        content: |
          overlay
          br_netfilter

    - name: Configure Kubernetes sysctl settings
      ansible.builtin.copy:
        dest: /etc/sysctl.d/k8s.conf
        mode: "0644"
        content: |
          net.bridge.bridge-nf-call-iptables = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward = 1

    - name: Apply sysctl settings
      ansible.builtin.command: sysctl --system
      changed_when: false

    - name: Ensure time sync is enabled
      ansible.builtin.command: timedatectl set-ntp true
      changed_when: false

    - name: Disable sleep target
      ansible.builtin.systemd:
        name: sleep.target
        masked: true

    - name: Disable suspend target
      ansible.builtin.systemd:
        name: suspend.target
        masked: true

    - name: Disable hibernate target
      ansible.builtin.systemd:
        name: hibernate.target
        masked: true

    - name: Disable hybrid sleep target
      ansible.builtin.systemd:
        name: hybrid-sleep.target
        masked: true
```

Run it:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/00-os-prereqs.yaml
```

---

# Step 10: Install containerd

Create:

```bash
nano ansible/playbooks/01-containerd.yaml
```

Add:

```yaml
---
- name: Install and configure containerd
  hosts: k8s_nodes
  become: true

  tasks:
    - name: Install containerd
      ansible.builtin.apt:
        name:
          - containerd
        state: present
        update_cache: true

    - name: Create containerd config directory
      ansible.builtin.file:
        path: /etc/containerd
        state: directory
        mode: "0755"

    - name: Generate default containerd config
      ansible.builtin.shell: containerd config default > /etc/containerd/config.toml
      args:
        creates: /etc/containerd/config.toml

    - name: Use systemd cgroup driver
      ansible.builtin.replace:
        path: /etc/containerd/config.toml
        regexp: 'SystemdCgroup = false'
        replace: 'SystemdCgroup = true'

    - name: Enable and restart containerd
      ansible.builtin.systemd:
        name: containerd
        enabled: true
        state: restarted
```

Run:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/01-containerd.yaml
```

---

# Step 11: Install Kubernetes Packages

Create:

```bash
nano ansible/playbooks/02-kubernetes-packages.yaml
```

Add:

```yaml
---
- name: Install Kubernetes packages
  hosts: k8s_nodes
  become: true

  tasks:
    - name: Install required packages
      ansible.builtin.apt:
        name:
          - apt-transport-https
          - ca-certificates
          - curl
          - gpg
        state: present
        update_cache: true

    - name: Create apt keyrings directory
      ansible.builtin.file:
        path: /etc/apt/keyrings
        state: directory
        mode: "0755"

    - name: Download Kubernetes apt key
      ansible.builtin.shell: |
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v{{ kubernetes_version_minor }}/deb/Release.key \
          | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
      args:
        creates: /etc/apt/keyrings/kubernetes-apt-keyring.gpg

    - name: Add Kubernetes apt repository
      ansible.builtin.copy:
        dest: /etc/apt/sources.list.d/kubernetes.list
        mode: "0644"
        content: |
          deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v{{ kubernetes_version_minor }}/deb/ /

    - name: Install kubelet kubeadm kubectl
      ansible.builtin.apt:
        name:
          - kubelet
          - kubeadm
          - kubectl
        state: present
        update_cache: true

    - name: Hold Kubernetes packages
      ansible.builtin.dpkg_selections:
        name: "{{ item }}"
        selection: hold
      loop:
        - kubelet
        - kubeadm
        - kubectl

    - name: Enable kubelet
      ansible.builtin.systemd:
        name: kubelet
        enabled: true
```

Run:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/02-kubernetes-packages.yaml
```

---

# Step 12: Reboot Nodes

After the package setup, reboot all nodes:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m reboot --become
```

Wait a minute, then test:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

---

# Step 13: Install kube-vip for the API VIP

We need the Kubernetes API to live behind:

```text
192.168.2.80
```

For a highly available kubeadm control plane, use `kube-vip`.

SSH into `k8s-1`:

```bash
ssh ubuntu@192.168.2.10
```

Pull the kube-vip image and generate the manifest:

```bash
sudo ctr image pull ghcr.io/kube-vip/kube-vip:v0.8.2
```

Create the static pod manifest directory if needed:

```bash
sudo mkdir -p /etc/kubernetes/manifests
```

Generate the kube-vip manifest:

```bash
sudo ctr run --rm --net-host ghcr.io/kube-vip/kube-vip:v0.8.2 vip \
  /kube-vip manifest pod \
  --interface "$(ip route | awk '/default/ {print $5; exit}')" \
  --address 192.168.2.80 \
  --controlplane \
  --arp \
  --leaderElection \
  > kube-vip.yaml
```

Move it into place:

```bash
sudo mv kube-vip.yaml /etc/kubernetes/manifests/kube-vip.yaml
```

Exit back to your Mac:

```bash
exit
```

---

# Step 14: Create kubeadm Config

On your Mac, create:

```bash
nano kubernetes/bootstrap/kubeadm-config.yaml
```

Add:

```yaml
apiVersion: kubeadm.k8s.io/v1beta4
kind: ClusterConfiguration
kubernetesVersion: v1.36.1
controlPlaneEndpoint: "192.168.2.80:6443"
networking:
  podSubnet: "10.244.0.0/16"
  serviceSubnet: "10.96.0.0/12"
apiServer:
  certSANs:
    - "192.168.2.80"
    - "k8s-api.k8s.lan"
    - "k8s-1"
    - "k8s-2"
    - "k8s-3"
    - "192.168.2.10"
    - "192.168.2.11"
    - "192.168.2.12"
---
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
cgroupDriver: systemd
```

Copy it to `k8s-1`:

```bash
scp kubernetes/bootstrap/kubeadm-config.yaml ubuntu@192.168.2.10:/tmp/kubeadm-config.yaml
```

---

# Step 15: Initialize the Cluster on k8s-1

SSH into `k8s-1`:

```bash
ssh ubuntu@192.168.2.10
```

Run:

```bash
sudo kubeadm init \
  --config /tmp/kubeadm-config.yaml \
  --upload-certs
```

At the end, kubeadm will print commands like:

```text
kubeadm join 192.168.2.80:6443 ...
```

Important: save both join commands:

1. The control-plane join command
2. The certificate key line

They will look roughly like this:

```bash
sudo kubeadm join 192.168.2.80:6443 \
  --token ... \
  --discovery-token-ca-cert-hash sha256:... \
  --control-plane \
  --certificate-key ...
```

Now configure kubeconfig on `k8s-1`:

```bash
mkdir -p ~/.kube
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown "$(id -u):$(id -g)" ~/.kube/config
```

Check:

```bash
kubectl get nodes
```

You will probably see:

```text
k8s-1   NotReady
```

That is expected until Cilium is installed.

Exit back to your Mac:

```bash
exit
```

---

# Step 16: Copy kubeconfig to Your Mac

On your Mac:

```bash
mkdir -p ~/.kube
scp ubuntu@192.168.2.10:/home/ubuntu/.kube/config ~/.kube/homelab
```

If your Ubuntu username is not `ubuntu`, adjust the path.

Set your kubeconfig:

```bash
export KUBECONFIG=~/.kube/homelab
```

Check:

```bash
kubectl get nodes
```

Expected:

```text
NAME    STATUS     ROLES           AGE   VERSION
k8s-1   NotReady   control-plane   ...
```

---

# Step 17: Install Cilium

Create:

```bash
nano kubernetes/addons/cilium/values.yaml
```

Add:

```yaml
kubeProxyReplacement: true

k8sServiceHost: 192.168.2.80
k8sServicePort: 6443

ipam:
  mode: kubernetes

operator:
  replicas: 1

hubble:
  enabled: true
  relay:
    enabled: true
  ui:
    enabled: true
```

Add the Helm repo and install Cilium:

```bash
helm repo add cilium https://helm.cilium.io
helm repo update
helm upgrade --install cilium cilium/cilium \
  --namespace kube-system \
  --values kubernetes/addons/cilium/values.yaml
```

Wait:

```bash
kubectl -n kube-system rollout status ds/cilium
kubectl get nodes
```

Eventually `k8s-1` should become:

```text
Ready
```

---

# Step 18: Join k8s-2 and k8s-3 as Control-Plane Nodes

Before joining, install kube-vip manifest on each additional control-plane node.

SSH into `k8s-2`:

```bash
ssh ubuntu@192.168.2.11
```

Run:

```bash
sudo ctr image pull ghcr.io/kube-vip/kube-vip:v0.8.2
sudo mkdir -p /etc/kubernetes/manifests
sudo ctr run --rm --net-host ghcr.io/kube-vip/kube-vip:v0.8.2 vip \
  /kube-vip manifest pod \
  --interface "$(ip route | awk '/default/ {print $5; exit}')" \
  --address 192.168.2.80 \
  --controlplane \
  --arp \
  --leaderElection \
  > kube-vip.yaml
sudo mv kube-vip.yaml /etc/kubernetes/manifests/kube-vip.yaml
```

Then run the control-plane join command from kubeadm.

It will look like:

```bash
sudo kubeadm join 192.168.2.80:6443 \
  --token YOUR_TOKEN \
  --discovery-token-ca-cert-hash sha256:YOUR_HASH \
  --control-plane \
  --certificate-key YOUR_CERT_KEY
```

Repeat the same for `k8s-3`.

Then from your Mac:

```bash
kubectl get nodes
```

Expected eventually:

```text
NAME    STATUS   ROLES           AGE   VERSION
k8s-1   Ready    control-plane   ...
k8s-2   Ready    control-plane   ...
k8s-3   Ready    control-plane   ...
```

---

# Step 19: Install metrics-server

Create:

```bash
nano kubernetes/addons/metrics-server/values.yaml
```

Add:

```yaml
args:
  - --kubelet-insecure-tls
```

Install:

```bash
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo update
helm upgrade --install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --values kubernetes/addons/metrics-server/values.yaml
```

Test:

```bash
kubectl top nodes
```

It may take a minute or two before metrics appear.

---

# Step 20: Install MetalLB

Create:

```bash
nano kubernetes/addons/metallb/values.yaml
```

Add:

```yaml
controller:
  enabled: true

speaker:
  enabled: true
```

Install:

```bash
helm repo add metallb https://metallb.github.io/metallb
helm repo update
helm upgrade --install metallb metallb/metallb \
  --namespace metallb-system \
  --create-namespace \
  --values kubernetes/addons/metallb/values.yaml
```

Wait:

```bash
kubectl -n metallb-system rollout status deployment/metallb-controller
kubectl -n metallb-system rollout status daemonset/metallb-speaker
```

Create the address pool:

```bash
nano kubernetes/addons/metallb/ip-address-pool.yaml
```

Add:

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: lan-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.2.100-192.168.2.149
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: lan-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - lan-pool
```

Apply:

```bash
kubectl apply -f kubernetes/addons/metallb/ip-address-pool.yaml
```

---

# Step 21: Install Envoy Gateway

Create:

```bash
nano kubernetes/addons/envoy-gateway/values.yaml
```

For now, add an empty values file:

```yaml
---
```

Install:

```bash
helm repo add eg https://gateway.envoyproxy.io
helm repo update
helm upgrade --install envoy-gateway eg/gateway-helm \
  --namespace envoy-gateway-system \
  --create-namespace \
  --values kubernetes/addons/envoy-gateway/values.yaml
```

Wait:

```bash
kubectl -n envoy-gateway-system get pods
```

Create GatewayClass:

```bash
nano kubernetes/addons/envoy-gateway/gatewayclass.yaml
```

Add:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
```

Apply:

```bash
kubectl apply -f kubernetes/addons/envoy-gateway/gatewayclass.yaml
```

Create Gateway:

```bash
nano kubernetes/addons/envoy-gateway/gateway.yaml
```

Add:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: gateway-system
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main-gateway
  namespace: gateway-system
spec:
  gatewayClassName: eg
  addresses:
    - type: IPAddress
      value: 192.168.2.100
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      hostname: "*.k8s.lan"
      allowedRoutes:
        namespaces:
          from: All
```

Apply:

```bash
kubectl apply -f kubernetes/addons/envoy-gateway/gateway.yaml
```

Check whether Envoy received the load balancer IP:

```bash
kubectl get svc -A | grep LoadBalancer
```

You want to see something using:

```text
192.168.2.100
```

---

# Step 22: Deploy a Test App

Create a namespace:

```bash
kubectl create namespace apps
```

Create a test app manifest:

```bash
nano apps/whoami/whoami.yaml
```

Add:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whoami
  namespace: apps
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: whoami
  template:
    metadata:
      labels:
        app.kubernetes.io/name: whoami
    spec:
      containers:
        - name: whoami
          image: traefik/whoami:latest
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: whoami
  namespace: apps
spec:
  selector:
    app.kubernetes.io/name: whoami
  ports:
    - name: http
      port: 80
      targetPort: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: whoami
  namespace: apps
spec:
  parentRefs:
    - name: main-gateway
      namespace: gateway-system
  hostnames:
    - whoami.k8s.lan
  rules:
    - backendRefs:
        - name: whoami
          port: 80
```

Apply:

```bash
kubectl apply -f apps/whoami/whoami.yaml
```

Check:

```bash
kubectl -n apps get pods
kubectl -n apps get svc
kubectl -n apps get httproute
```

---

# Step 23: Add/Test DNS

You need:

```text
whoami.k8s.lan -> 192.168.2.100
```

If you added this in UniFi, test:

```bash
dig whoami.k8s.lan
```

Expected:

```text
192.168.2.100
```

If DNS is not set up yet, temporarily add this to your Mac:

```bash
sudo nano /etc/hosts
```

Add:

```text
192.168.2.100 whoami.k8s.lan
```

Then test:

```bash
curl http://whoami.k8s.lan
```

Expected output should look something like:

```text
Hostname: whoami-...
IP: 127.0.0.1
IP: ...
RemoteAddr: ...
GET / HTTP/1.1
Host: whoami.k8s.lan
User-Agent: curl/...
```

If you get that, your platform path is working:

```text
Mac -> DNS -> MetalLB -> Envoy Gateway -> HTTPRoute -> Service -> Pod
```

---

# Step 24: Recommended Checkpoints

Run these and save the output if anything fails:

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get svc -A
kubectl get gatewayclass
kubectl get gateway -A
kubectl get httproute -A
kubectl -n metallb-system get ipaddresspool,l2advertisement
```

Healthy cluster should look roughly like:

```text
All nodes: Ready
Cilium pods: Running
CoreDNS pods: Running
MetalLB controller/speaker: Running
Envoy Gateway pods: Running
whoami pods: Running
Gateway: Accepted/Programmed
HTTPRoute: Accepted
```

---

# Stop Point

The next milestone is:

```bash
curl http://whoami.k8s.lan
```

working from your Mac.

Do these steps up to the Ansible ping first:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

If that works, continue with the three Ansible playbooks.

If you want, send me the output of:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

and I’ll guide you through the kubeadm/bootstrap phase carefully.
