import { MarkerType, Position } from '@xyflow/react'

import type { TopologyEdge, TopologyNode } from './types'

export type PlatformApp = {
  name: string
  image: string
  status: string
  ready: boolean
  replicas: number
  port: number
  domains: Array<{
    host: string
    scope: 'local' | 'public'
    status: string
  }>
  lastBuild: string
  source: string
  updatedAt: string
}

const edgeDefaults = {
  type: 'smoothstep',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
  },
} as const

export function createServiceTopology(apps: PlatformApp[]): {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
} {
  const serviceNodes = apps.map<TopologyNode>((app, index) => ({
    id: app.name,
    type: 'topologyNode',
    position: { x: 1080, y: 140 + index * 180 },
    data: {
      title: app.name,
      subtitle: `${app.replicas} replicas :${app.port}`,
      details: `${app.name} is deployed from ${app.image}.`,
      category: 'service',
      status: app.status,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      facts: {
        image: app.image,
        build: app.lastBuild,
        source: app.source,
      },
      sources: ['platform.edinstance.uk/v1alpha1 App'],
    },
  }))

  const nodes: TopologyNode[] = [
    {
      id: 'upload',
      type: 'topologyNode',
      position: { x: 0, y: 140 },
      data: {
        title: 'Upload + build',
        subtitle: 'source archive -> BuildKit',
        details: 'The UI uploads source, the API starts a rootless BuildKit job, and the resulting image is pushed to GHCR.',
        category: 'build',
        status: 'planned',
        sourcePosition: Position.Right,
        facts: {
          input: 'zip/tar + Dockerfile',
          builder: 'rootless BuildKit',
        },
        sources: ['services/platform-api', 'plan.md'],
      },
    },
    {
      id: 'ghcr',
      type: 'topologyNode',
      position: { x: 360, y: 140 },
      data: {
        title: 'GHCR',
        subtitle: 'immutable app images',
        details: 'Built images are pushed to GitHub Container Registry and deployed by immutable tag.',
        category: 'registry',
        status: 'planned',
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        facts: {
          registry: 'ghcr.io',
          namespace: 'edinstance-lab',
        },
        sources: ['plan.md'],
      },
    },
    ...serviceNodes,
    {
      id: 'platform-frontend',
      type: 'topologyNode',
      position: { x: 360, y: 400 },
      data: {
        title: 'Platform frontend',
        subtitle: 'TanStack Start :3000',
        details: 'The authenticated management UI and service graph.',
        category: 'system',
        status: 'active',
        sourcePosition: Position.Right,
        facts: { public: 'ui.edinstance.uk', local: 'ui.local.edinstance.uk' },
        sources: ['services/frontend'],
      },
    },
    {
      id: 'platform-api',
      type: 'topologyNode',
      position: { x: 720, y: 400 },
      data: {
        title: 'Platform API',
        subtitle: 'Go control plane :8080',
        details: 'Stores desired state and reconciles managed workloads.',
        category: 'system',
        status: 'active',
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        facts: { public: 'api.edinstance.uk', namespace: 'platform-system' },
        sources: ['services/platform-api'],
      },
    },
    {
      id: 'platform-db',
      type: 'topologyNode',
      position: { x: 1080, y: 400 },
      data: {
        title: 'Platform PostgreSQL',
        subtitle: '3 instances + PgBouncer',
        details: 'CloudNativePG database backing platform state and authentication.',
        category: 'system',
        status: 'active',
        targetPosition: Position.Left,
        facts: { version: '17', storage: '20Gi Longhorn' },
        sources: ['kubernetes/platform/database'],
      },
    },
    {
      id: 'gateway',
      type: 'topologyNode',
      position: { x: 1440, y: 140 },
      data: {
        title: 'Gateway routes',
        subtitle: 'HTTPRoute + tunnel targets',
        details: 'Platform app domains become local HTTPRoutes and selected public Cloudflare Tunnel hostnames.',
        category: 'gateway',
        status: 'planned',
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        facts: {
          local: '*.local.edinstance.uk',
          public: '*.edinstance.uk',
        },
        sources: ['dns.md', 'cloudflare-tunnel.md'],
      },
    },
    {
      id: 'dns',
      type: 'topologyNode',
      position: { x: 1800, y: 140 },
      data: {
        title: 'DNS',
        subtitle: 'local + public names',
        details: 'Local names resolve to Envoy Gateway. Public names are managed in Cloudflare under edinstance.uk.',
        category: 'dns',
        status: 'planned',
        targetPosition: Position.Left,
        facts: {
          local: '<app>.local.edinstance.uk',
          public: '<app>.edinstance.uk',
        },
        sources: ['dns.md'],
      },
    },
  ]

  const buildEdges: TopologyEdge[] = [
    {
      ...edgeDefaults,
      id: 'upload-ghcr',
      source: 'upload',
      target: 'ghcr',
      data: { flow: 'build', label: 'push image' },
    },
    ...apps.map<TopologyEdge>((app) => ({
      ...edgeDefaults,
      id: `ghcr-${app.name}`,
      source: 'ghcr',
      target: app.name,
      data: { flow: 'runtime', label: 'deploy image' },
    })),
    {
      ...edgeDefaults,
      id: 'platform-frontend-api',
      source: 'platform-frontend',
      target: 'platform-api',
      data: { flow: 'runtime', label: 'control requests' },
    },
    {
      ...edgeDefaults,
      id: 'platform-api-db',
      source: 'platform-api',
      target: 'platform-db',
      data: { flow: 'runtime', label: 'platform state' },
    },
    {
      ...edgeDefaults,
      id: 'platform-frontend-gateway',
      source: 'platform-frontend',
      target: 'gateway',
      data: { flow: 'runtime', label: 'UI route' },
    },
    ...apps.map<TopologyEdge>((app) => ({
      ...edgeDefaults,
      id: `${app.name}-gateway`,
      source: app.name,
      target: 'gateway',
      data: { flow: 'runtime', label: 'service route' },
    })),
    {
      ...edgeDefaults,
      id: 'gateway-dns',
      source: 'gateway',
      target: 'dns',
      data: { flow: 'dns', label: 'hostnames' },
    },
  ]

  return { nodes, edges: buildEdges }
}
