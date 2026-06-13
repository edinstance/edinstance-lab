import type { Edge, Node, Position } from "@xyflow/react";

export type TopologyCategory =
  | "build"
  | "dns"
  | "gateway"
  | "registry"
  | "service"
  | "system";

export type TopologyFlow = "runtime" | "build" | "dns";

export interface TopologyNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  details: string;
  category: TopologyCategory;
  status?: string;
  facts: Record<string, string | undefined>;
  sources: Array<string>;
  sourcePosition?: Position;
  targetPosition?: Position;
}

export type TopologyNode = Node<TopologyNodeData, "topologyNode">;

export interface TopologyEdgeData extends Record<string, unknown> {
  flow: TopologyFlow;
  label: string;
}

export type TopologyEdge = Edge<TopologyEdgeData>;
