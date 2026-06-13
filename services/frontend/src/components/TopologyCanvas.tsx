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
import { useEffect, useMemo, useState } from 'react'

import { createServiceTopology, type PlatformApp } from '../topology/topology'
import type { TopologyEdge, TopologyFlow, TopologyNode as TopologyNodeType } from '../topology/types'
import { TopologyNode } from './TopologyNode'

const nodeTypes: NodeTypes = {
  topologyNode: TopologyNode,
}

const controlClass = 'min-h-[30px] border border-[#9c927f] bg-[#fffdf7e0] px-2.5 font-mono text-[.72rem] font-extrabold leading-none text-[#17211b] transition-colors hover:border-[#17211b] hover:bg-[#17211b] hover:text-[#fffdf7] disabled:cursor-not-allowed disabled:opacity-55'

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
  const [selectedNodeId, setSelectedNodeId] = useState<string>(apps[0]?.name ?? 'platform-frontend')
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
  const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdge>(filteredEdges)

  useEffect(() => {
    setNodes(withFlowState(cloneTopologyNodes(topology.nodes), topology.edges, activeFlow))
    setEdges(topology.edges.map((edge) => withEdgeState(edge, activeFlow)))
  }, [activeFlow, setEdges, setNodes, topology])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitView({ padding: 0.12, duration: 260 }))
    return () => window.cancelAnimationFrame(frame)
  }, [apps])

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
    <main className="h-screen p-3 max-[1080px]:h-auto max-[1080px]:min-h-screen">
      <section className="h-full min-h-0 overflow-hidden border border-[#17211b24] bg-[#fffdf7d1] max-[1080px]:h-[72vh] max-[1080px]:min-h-[560px]" aria-label="Interactive Kubernetes topology">
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
          <Panel className="!flex max-w-[calc(100vw-72px)] !items-center gap-3 border border-[#c9c1af] !bg-[#fffdf7f0] p-2 max-[1080px]:!grid max-[1080px]:max-w-[calc(100vw-48px)]" position="top-left">
            <div className="w-[210px] border-r border-[#c9c1af] py-1 pl-1.5 pr-3.5 max-[1080px]:w-auto">
              <p className="mb-1.5 mt-0 font-mono text-[.68rem] font-black uppercase leading-none text-[#66736b]">edinstance platform</p>
              <h1 className="m-0 text-[1.05rem] leading-none">Service graph</h1>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Topology flow filters">
                <button className={`${controlClass} border-[#315c5273] text-[#315c52]`} onClick={handleResetLayout} type="button">
                  Reset
                </button>
                <Link className={`${controlClass} inline-flex items-center no-underline`} to="/manage">
                  Manage
                </Link>
              </div>
            </div>
          </Panel>
          <Panel className="!flex !flex-wrap !items-center gap-3 border border-[#c9c1af] !bg-[#fffdf7e0] px-2.5 py-2 font-mono text-[.7rem] font-extrabold leading-none" position="bottom-center">
            <span className="inline-flex items-center gap-2"><i className="network-key h-[3px] w-7 bg-[#517a38]" /> live network traffic</span>
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
    animated: !muted,
    className: `${muted ? 'is-muted ' : ''}${flow === 'dns' ? '[&>path]:stroke-[#2d6f8f] [&>path]:[stroke-dasharray:8_8]' : flow === 'runtime' ? '[&>path]:stroke-[#517a38]' : '[&>path]:stroke-[#b0822e]'} [&>path]:stroke-[2.2]`,
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
