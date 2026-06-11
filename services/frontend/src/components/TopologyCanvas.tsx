import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeTypes,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import { Link } from '@tanstack/react-router'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'

import { createServiceTopology, type PlatformApp } from '../topology/topology'
import type { TopologyEdge, TopologyFlow, TopologyNode as TopologyNodeType } from '../topology/types'
import { TopologyNode } from './TopologyNode'

const nodeTypes: NodeTypes = {
  topologyNode: TopologyNode,
}

const flows: Array<{ id: TopologyFlow | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'build', label: 'Builds' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'dns', label: 'DNS' },
]

type TopologyCanvasProps = {
  apps?: PlatformApp[]
}

export function TopologyCanvas({ apps = [] }: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner apps={apps} />
    </ReactFlowProvider>
  )
}

function TopologyCanvasInner({ apps }: Required<TopologyCanvasProps>) {
  const [activeFlow, setActiveFlow] = useState<TopologyFlow | 'all'>('all')
  const [selectedNodeId, setSelectedNodeId] = useState<string>(apps[0]?.name ?? 'upload')
  const { fitView } = useReactFlow<TopologyNodeType, TopologyEdge>()
  const topology = useMemo(() => createServiceTopology(apps), [apps])

  const filteredNodes = useMemo(
    () => withFlowState(topology.nodes, topology.edges, activeFlow),
    [activeFlow, topology],
  )
  const filteredEdges = useMemo(
    () => topology.edges.map((edge) => withEdgeState(edge, activeFlow)),
    [activeFlow, topology],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNodeType>(filteredNodes)
  const [edges, , onEdgesChange] = useEdgesState<TopologyEdge>(filteredEdges)

  const displayNodes = useMemo(
    () => nodes.map((node) => withNodeSelection(node, selectedNodeId, activeFlow, topology.edges)),
    [activeFlow, nodes, selectedNodeId, topology.edges],
  )
  const displayEdges = useMemo(
    () => edges.map((edge) => withEdgeState(edge as TopologyEdge, activeFlow)),
    [activeFlow, edges],
  )

  function handleSelectionChange({ nodes: selectedNodes }: OnSelectionChangeParams) {
    const nextNode = selectedNodes[0]
    if (nextNode) {
      setSelectedNodeId(nextNode.id)
    }
  }

  function handleResetLayout() {
    setNodes(withFlowState(cloneTopologyNodes(topology.nodes), topology.edges, activeFlow))
    window.requestAnimationFrame(() => {
      fitView({ padding: 0.12, duration: 260 })
    })
  }

  return (
    <main className="app-shell">
      <section className="map-shell" aria-label="Interactive Kubernetes topology">
        <ReactFlow<TopologyNodeType, TopologyEdge>
          colorMode="light"
          defaultViewport={{ x: 60, y: 80, zoom: 0.7 }}
          edges={displayEdges}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          maxZoom={1.55}
          minZoom={0.38}
          nodeTypes={nodeTypes}
          nodes={displayNodes}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
          onSelectionChange={handleSelectionChange}
          proOptions={{ hideAttribution: true }}
          snapGrid={[16, 16]}
          snapToGrid
        >
          <Background color="#c9c1af" gap={28} size={1} />
          <MiniMap
            maskColor="rgba(244, 241, 232, .72)"
            nodeColor={(node) => nodeColor(node as TopologyNodeType)}
            nodeStrokeWidth={3}
            pannable
            position="bottom-right"
            style={{ height: 110, width: 160 }}
            zoomable
          />
          <Controls position="bottom-left" />
          <Panel className="topology-header" position="top-left">
            <div className="brand-block">
              <p>edinstance platform</p>
              <h1>Service graph</h1>
            </div>
            <div className="header-tools">
              <div className="flow-controls" role="toolbar" aria-label="Topology flow filters">
                {flows.map((flow) => (
                  <button
                    className={activeFlow === flow.id ? 'active' : undefined}
                    key={flow.id}
                    onClick={() => setActiveFlow(flow.id)}
                    type="button"
                  >
                    {flow.label}
                  </button>
                ))}
                <button className="reset-button" onClick={handleResetLayout} type="button">
                  Reset
                </button>
                <Link className="graph-link" to="/manage">
                  Manage
                </Link>
              </div>
            </div>
          </Panel>
          <Panel className="legend-panel" position="bottom-center">
            <span><i className="legend-line legend-line--build" /> image build</span>
            <span><i className="legend-line legend-line--runtime" /> running service</span>
            <span><i className="legend-line legend-line--dns" /> DNS route</span>
          </Panel>
        </ReactFlow>
      </section>
    </main>
  )
}

function withFlowState(
  nodes: TopologyNodeType[],
  edges: TopologyEdge[],
  activeFlow: TopologyFlow | 'all',
): TopologyNodeType[] {
  if (activeFlow === 'all') {
    return nodes
  }

  const activeNodeIds = new Set(
    edges
      .filter((edge) => edge.data?.flow === activeFlow)
      .flatMap((edge) => [edge.source, edge.target]),
  )

  return nodes.map((node) => ({
    ...node,
    className: activeNodeIds.has(node.id) ? undefined : 'is-muted',
  }))
}

function cloneTopologyNodes(nodes: TopologyNodeType[]): TopologyNodeType[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data },
    position: { ...node.position },
  }))
}

function withNodeSelection(
  node: TopologyNodeType,
  selectedNodeId: string,
  activeFlow: TopologyFlow | 'all',
  edges: TopologyEdge[],
): TopologyNodeType {
  const flowNode = withFlowState([node], edges, activeFlow)[0]
  return {
    ...flowNode,
    selected: node.id === selectedNodeId,
  }
}

function withEdgeState(edge: TopologyEdge, activeFlow: TopologyFlow | 'all'): TopologyEdge {
  const flow = edge.data?.flow
  const muted = activeFlow !== 'all' && flow !== activeFlow

  return {
    ...edge,
    animated: !muted && flow === activeFlow,
    className: `flow-edge flow-edge--${flow}${muted ? ' is-muted' : ''}`,
  }
}

function nodeColor(node: TopologyNodeType) {
  const colors = {
    build: '#b0822e',
    dns: '#d65236',
    gateway: '#315c52',
    registry: '#2d6f8f',
    service: '#517a38',
    system: '#17211b',
  }

  return colors[node.data.category]
}
