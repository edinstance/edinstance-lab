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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";

import { createServiceTopology } from "../topology/topology";
import { TopologyNode } from "./TopologyNode";
import type { NodeTypes } from "@xyflow/react";
import type { PlatformApp } from "../topology/topology";
import type {
  TopologyEdge,
  TopologyNode as TopologyNodeType,
} from "../topology/types";

const nodeTypes: NodeTypes = { topologyNode: TopologyNode };
const emptyApps: Array<PlatformApp> = [];

interface Props {
  apps?: Array<PlatformApp>;
  loading?: boolean;
  selectedNodeId?: string | null;
  onSelect?: (id: string) => void;
  onAdd?: () => void;
}

export function TopologyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner
        apps={props.apps ?? emptyApps}
        loading={props.loading ?? false}
        onAdd={props.onAdd}
        onSelect={props.onSelect}
        selectedNodeId={props.selectedNodeId ?? null}
      />
    </ReactFlowProvider>
  );
}

function TopologyCanvasInner({
  apps,
  loading,
  selectedNodeId,
  onSelect,
  onAdd,
}: Required<Pick<Props, "apps" | "loading" | "selectedNodeId">> &
  Pick<Props, "onSelect" | "onAdd">) {
  const topology = useMemo(() => createServiceTopology(apps), [apps]);
  const { fitView } = useReactFlow<TopologyNodeType, TopologyEdge>();

  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNodeType>(
    topology.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdge>(
    topology.edges,
  );

  useEffect(() => {
    setNodes(topology.nodes);
    setEdges(topology.edges);
  }, [setEdges, setNodes, topology]);

  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const selected = node.id === selectedNodeId;
        return node.selected === selected ? node : { ...node, selected };
      }),
    );
  }, [selectedNodeId, setNodes]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 420 });
    });
    return () => cancelAnimationFrame(frame);
  }, [apps.length, fitView]);

  return (
    <section className="h-full p-3" aria-label="Platform service canvas">
      <div className="h-full overflow-hidden rounded-2xl border border-[#322d3b] bg-[#100e17]">
        <ReactFlow<TopologyNodeType, TopologyEdge>
          colorMode="dark"
          defaultViewport={{ x: 80, y: 80, zoom: 0.75 }}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          maxZoom={1.5}
          minZoom={0.35}
          nodes={nodes}
          nodeTypes={nodeTypes}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => onSelect?.(node.id)}
          proOptions={{ hideAttribution: true }}
          snapGrid={[20, 20]}
          snapToGrid
        >
          <Background color="#4a4358" gap={38} size={1} />
          <MiniMap
            className="!rounded-lg !border !border-[#393242] !bg-[#17141f]"
            maskColor="rgba(13,11,20,.68)"
            nodeColor={(node) =>
              node.data.category === "service" ? "#8b5cf6" : "#53505e"
            }
            nodeStrokeWidth={2}
            pannable
            position="bottom-right"
            zoomable
          />
          <Controls className="railway-controls" position="bottom-left" />
          <Panel className="!m-5 flex items-center gap-3" position="top-left">
            <div className="rounded-xl border border-[#393342] bg-[#17141f]/95 px-4 py-3 shadow-xl backdrop-blur">
              <p className="m-0 text-xs font-semibold tracking-[.16em] text-[#777080] uppercase">
                edinstance
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-semibold">Production</span>
                <span className="h-2 w-2 rounded-full bg-[#4ed08f] shadow-[0_0_12px_#4ed08f]" />
              </div>
            </div>
          </Panel>
          <Panel className="!m-5" position="top-right">
            <button
              className="flex min-h-12 items-center gap-2 rounded-xl border border-[#484052] bg-[#211d2b] px-5 text-sm font-semibold text-white shadow-xl transition hover:border-[#76558f] hover:bg-[#2a2336]"
              onClick={onAdd}
              type="button"
            >
              <span className="text-xl text-[#bd8cff]">＋</span> Add service
            </button>
          </Panel>
          {loading ? (
            <Panel
              className="rounded-lg border border-[#393342] bg-[#17141f] px-4 py-3 text-sm text-[#91899f]"
              position="bottom-center"
            >
              Loading services…
            </Panel>
          ) : null}
          {!loading && !apps.length ? (
            <Panel
              className="rounded-xl border border-[#393342] bg-[#17141f]/95 px-6 py-5 text-center shadow-2xl"
              position="top-center"
            >
              <p className="m-0 font-semibold">Your canvas is empty</p>
              <p className="mt-1 mb-0 text-sm text-[#91899f]">
                Add a service to deploy your first workload.
              </p>
            </Panel>
          ) : null}
        </ReactFlow>
      </div>
    </section>
  );
}
