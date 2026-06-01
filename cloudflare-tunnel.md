# Cloudflare Tunnel

Cloudflare Tunnel is the preferred way to expose selected `*.lab.edinstance.com` services to the internet from this homelab.

It avoids inbound router port forwards. Instead, `cloudflared` runs inside Kubernetes and creates outbound connections to Cloudflare. Cloudflare routes public hostnames through that tunnel back to internal Kubernetes services.

## Files

```text
kubernetes/addons/cloudflare-tunnel/namespace.yml
kubernetes/addons/cloudflare-tunnel/secret.example.yml
kubernetes/addons/cloudflare-tunnel/deployment.yml
kubernetes/addons/cloudflare-tunnel/networkpolicy.yml
```

The committed secret file is only an example. Do not commit a real tunnel token.

## Traffic Model

Local LAN traffic:

```text
client -> service.local.edinstance.com -> 192.168.2.100 -> Envoy Gateway -> app
```

Public Cloudflare traffic:

```text
client -> Cloudflare -> cloudflared pods -> Kubernetes service -> app
```

Cloudflare Tunnel does not need a public IP, router port forward, or MetalLB public address.

## Recommended Routing

Keep MetalLB and Envoy Gateway for local/LAN access.

Use Cloudflare Tunnel for selected public hostnames under:

```text
*.lab.edinstance.com
```

For each public hostname in the Cloudflare Zero Trust dashboard, point the service at the internal Kubernetes service DNS name, for example:

```text
whoami.lab.edinstance.com -> http://whoami.apps.svc.cluster.local:80
```

The target application's `NetworkPolicy` must allow ingress from the
`cloudflare-tunnel` namespace.

You can also point Cloudflare at an in-cluster gateway/proxy service if you later standardize one stable internal gateway service name.

## Create The Tunnel

In Cloudflare Zero Trust:

1. Go to `Networks` -> `Tunnels`.
2. Create a Cloudflare Tunnel.
3. Choose Docker or Kubernetes-style connector instructions.
4. Copy the generated tunnel token.
5. Add public hostnames such as:

```text
whoami.lab.edinstance.com
```

with service targets such as:

```text
http://whoami.apps.svc.cluster.local:80
```

## Create The Kubernetes Secret

Create the token secret without writing the real token to git:

```bash
kubectl create namespace cloudflare-tunnel
kubectl -n cloudflare-tunnel create secret generic cloudflared-token \
  --from-literal=token='<cloudflare-tunnel-token>'
```

Or copy the example and apply it manually after replacing the placeholder:

```bash
cp kubernetes/addons/cloudflare-tunnel/secret.example.yml /tmp/cloudflared-token.yml
```

Do not commit the edited secret.

## Deploy The Connector

```bash
kubectl apply -f kubernetes/addons/cloudflare-tunnel/namespace.yml
kubectl apply -f kubernetes/addons/cloudflare-tunnel/deployment.yml
kubectl apply -f kubernetes/addons/cloudflare-tunnel/networkpolicy.yml
```

Check:

```bash
kubectl -n cloudflare-tunnel get pods
kubectl -n cloudflare-tunnel logs deploy/cloudflared
```

Expected:

```text
2 cloudflared pods Running
Connector registered with Cloudflare
```

## DNS

For public services, Cloudflare manages public DNS for `*.lab.edinstance.com` through the tunnel hostname routing.

For local services, keep LAN DNS:

```text
*.local.edinstance.com -> 192.168.2.100
```

Keep the local and public names separate. The tunnel should target internal
Kubernetes services directly rather than the LAN-only Envoy Gateway.

## Security

Only publish services that should be internet-accessible.

For admin services, use Cloudflare Access policies or keep them local/VPN-only. Good candidates for Access protection:

```text
grafana.lab.edinstance.com
longhorn.lab.edinstance.com
argocd.lab.edinstance.com
```

Do not expose Longhorn publicly without authentication and an access policy.

## Why This Does Not Replace MetalLB

Cloudflare Tunnel handles public ingress.

MetalLB handles local LAN `LoadBalancer` IPs.

Keeping both gives clean local access and safe public access without router port forwarding.
