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
      subtitle: `${app.replicas} ${app.replicas === 1 ? 'replica' : 'replicas'}`,
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
    ...serviceNodes,
    {
      id: 'platform-frontend',
      type: 'topologyNode',
      position: { x: 360, y: 400 },
      data: {
        title: 'Platform frontend',
        subtitle: 'TanStack Start',
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
        subtitle: 'Go control plane',
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
  ]

  const buildEdges: TopologyEdge[] = [
    ...apps.map<TopologyEdge>((app) => ({
      ...edgeDefaults,
      id: `platform-api-${app.name}`,
      source: 'platform-api',
      target: app.name,
      data: { flow: 'runtime', label: 'managed workload' },
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
  ]

  return { nodes, edges: buildEdges }
}
