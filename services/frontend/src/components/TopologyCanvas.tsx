import {
  Background,
  ControlButton,
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
import type { PostgresDatabase } from "../platform/api";
import type {
  TopologyEdge,
  TopologyNode as TopologyNodeType,
} from "../topology/types";

const nodeTypes: NodeTypes = { topologyNode: TopologyNode };
const emptyApps: Array<PlatformApp> = [];
const emptyDatabases: Array<PostgresDatabase> = [];

interface Props {
  apps?: Array<PlatformApp>;
  databases?: Array<PostgresDatabase>;
  loading?: boolean;
  selectedNodeId?: string | null;
  readOnly?: boolean;
  onSelect?: (id: string) => void;
  onAddService?: () => void;
  onAddDatabase?: () => void;
}

export function TopologyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner
        apps={props.apps ?? emptyApps}
        databases={props.databases ?? emptyDatabases}
        loading={props.loading ?? false}
        onAddDatabase={props.onAddDatabase}
        onAddService={props.onAddService}
        onSelect={props.onSelect}
        readOnly={props.readOnly ?? false}
        selectedNodeId={props.selectedNodeId ?? null}
      />
    </ReactFlowProvider>
  );
}

function TopologyCanvasInner({
  apps,
  databases,
  loading,
  selectedNodeId,
  readOnly,
  onSelect,
  onAddService,
  onAddDatabase,
}: Required<
  Pick<Props, "apps" | "databases" | "loading" | "readOnly" | "selectedNodeId">
> &
  Pick<Props, "onSelect" | "onAddService" | "onAddDatabase">) {
  const topology = useMemo(
    () => createServiceTopology(apps, databases),
    [apps, databases],
  );
  const { fitView } = useReactFlow<TopologyNodeType, TopologyEdge>();

  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNodeType>(
    topology.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdge>(
    topology.edges,
  );
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [nodes, selectedNodeId],
  );

  useEffect(() => {
    setNodes(topology.nodes);
    setEdges(topology.edges);
  }, [setEdges, setNodes, topology]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      resetCanvas();
    });
    return () => cancelAnimationFrame(frame);
  }, [apps.length, databases.length]);

  function resetCanvas() {
    setNodes(topology.nodes);
    setEdges(topology.edges);
    requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 420 });
    });
  }

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
          nodes={displayNodes}
          nodesConnectable={false}
          nodesDraggable={!readOnly}
          nodeTypes={nodeTypes}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => onSelect?.(node.id)}
          proOptions={{ hideAttribution: true }}
          elementsSelectable={!readOnly}
          snapGrid={[20, 20]}
          snapToGrid
        >
          <Background color="#4a4358" gap={38} size={1} />
          {!readOnly ? (
            <>
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
              <Controls
                className="railway-controls"
                fitViewOptions={{ padding: 0.18, duration: 420 }}
                position="bottom-left"
              >
                <ControlButton
                  aria-label="Reset canvas view"
                  onClick={resetCanvas}
                  title="Reset canvas view"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                </ControlButton>
              </Controls>
              <Panel className="m-5 flex gap-3" position="top-right">
                <button
                  className="flex min-h-12 items-center gap-2 rounded-xl border border-[#484052] bg-[#211d2b] px-5 text-sm font-semibold text-white shadow-xl transition hover:border-[#76558f] hover:bg-[#2a2336]"
                  onClick={onAddService}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-[#bd8cff]"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 4.5v15m7.5-7.5h-15"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                  Add service
                </button>
                <button
                  className="flex min-h-12 items-center gap-2 rounded-xl border border-[#484052] bg-[#211d2b] px-5 text-sm font-semibold text-white shadow-xl transition hover:border-[#76558f] hover:bg-[#2a2336]"
                  onClick={onAddDatabase}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-[#67dba2]"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 4.5v15m7.5-7.5h-15"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                  Add PostgreSQL
                </button>
              </Panel>
            </>
          ) : null}
          {!readOnly && loading ? (
            <Panel
              className="rounded-lg border border-[#393342] bg-[#17141f] px-4 py-3 text-sm text-[#91899f]"
              position="bottom-center"
            >
              Loading services…
            </Panel>
          ) : null}
          {!readOnly && !loading && !apps.length && !databases.length ? (
            <Panel
              className="rounded-xl border border-[#393342] bg-[#17141f]/95 px-6 py-5 text-center shadow-2xl"
              position="top-center"
            >
              <p className="m-0 font-semibold">Your canvas is empty</p>
              <p className="mt-1 mb-0 text-sm text-[#91899f]">
                Add a service or PostgreSQL cluster to deploy your first
                workload.
              </p>
            </Panel>
          ) : null}
        </ReactFlow>
      </div>
    </section>
  );
}
