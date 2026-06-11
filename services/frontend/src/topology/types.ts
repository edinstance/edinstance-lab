import type { Edge, Node, Position } from '@xyflow/react'

export type TopologyCategory =
  | 'build'
  | 'dns'
  | 'gateway'
  | 'registry'
  | 'service'
  | 'system'

export type TopologyFlow = 'runtime' | 'build' | 'dns'

export type TopologyNodeData = {
  title: string
  subtitle: string
  details: string
  category: TopologyCategory
  status?: string
  facts: Record<string, string>
  sources: string[]
  sourcePosition?: Position
  targetPosition?: Position
}

export type TopologyNode = Node<TopologyNodeData, 'topologyNode'>

export type TopologyEdgeData = {
  flow: TopologyFlow
  label: string
}

export type TopologyEdge = Edge<TopologyEdgeData>
