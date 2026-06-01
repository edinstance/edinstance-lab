# DNS Plan

Use separate subdomains for local and public service access:

```text
Local/LAN zone:       *.local.edinstance.com
Public/service zone:  *.lab.edinstance.com
```

The two zones use different ingress paths.

## Local Access

Create a wildcard record in UniFi or your LAN DNS server:

```text
*.local.edinstance.com  A  192.168.2.100
```

The address is the MetalLB-managed Envoy Gateway IP. Local traffic follows:

```text
client -> service.local.edinstance.com -> 192.168.2.100 -> Envoy Gateway -> HTTPRoute -> service
```

The Envoy Gateway only accepts `*.local.edinstance.com` hostnames.

Test local DNS and routing:

```bash
dig whoami.local.edinstance.com
curl http://whoami.local.edinstance.com
```

The DNS result should be:

```text
192.168.2.100
```

## Public Access

Use Cloudflare Tunnel for selected public hostnames:

```text
*.lab.edinstance.com
```

Configure each published hostname in the Cloudflare Zero Trust dashboard with
its internal Kubernetes service target:

```text
whoami.lab.edinstance.com -> http://whoami.apps.svc.cluster.local:80
```

Public traffic follows:

```text
client -> Cloudflare -> cloudflared pods -> Kubernetes service -> app
```

Do not point public DNS at `192.168.2.100`. It is a private LAN address. Do not
configure router port forwarding for Envoy Gateway.

Test a configured public route:

```bash
dig whoami.lab.edinstance.com
curl https://whoami.lab.edinstance.com
```

## TLS

Cloudflare handles browser-facing TLS for `*.lab.edinstance.com`.

For local Envoy access, cert-manager can request:

```text
local.edinstance.com
*.local.edinstance.com
```

using a Cloudflare DNS-01 challenge. DNS-01 does not require the local Envoy
Gateway to be publicly reachable.

## Service Naming Convention

Use matching short service names:

```text
whoami.local.edinstance.com
whoami.lab.edinstance.com
grafana.local.edinstance.com
grafana.lab.edinstance.com
```

Only create a `*.lab.edinstance.com` Cloudflare Tunnel route when a service
should be reachable from the internet.
