import { MarkerType, Position } from "@xyflow/react";

import type { TopologyEdge, TopologyNode } from "./types";
import type { PostgresDatabase } from "../platform/api";

export interface PlatformApp {
  name: string;
  image: string;
  status: string;
  ready: boolean;
  replicas: number;
  port: number;
  healthPath: string;
  domains: Array<{
    host: string;
    scope: "local" | "public";
    status: string;
  }>;
  lastBuild: string;
  source: string;
  updatedAt: string;
  failureReason?: string;
}

const edgeDefaults = {
  type: "smoothstep",
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
  },
} as const;

export function createServiceTopology(
  apps: Array<PlatformApp>,
  databases: Array<PostgresDatabase> = [],
): {
  nodes: Array<TopologyNode>;
  edges: Array<TopologyEdge>;
} {
  const serviceNodes = apps.map<TopologyNode>((app, index) => ({
    id: app.name,
    type: "topologyNode",
    position: { x: 1320, y: 680 + index * 250 },
    data: {
      title: app.name,
      subtitle: `${app.replicas} ${app.replicas === 1 ? "replica" : "replicas"}`,
      details: `${app.name} is deployed from ${app.image}.`,
      category: "service",
      status: app.status,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      facts: {
        image: app.image,
        build: app.lastBuild,
        source: app.source,
      },
      sources: ["platform.edinstance.uk/v1alpha1 App"],
    },
  }));

  const databaseNodes = databases.map<TopologyNode>((database, index) => ({
    id: `database:${database.name}`,
    type: "topologyNode",
    position: { x: 1840, y: 680 + index * 250 },
    data: {
      title: database.name,
      subtitle: `${database.instances} ${database.instances === 1 ? "instance" : "instances"}${database.poolerEnabled ? " + PgBouncer" : ""}`,
      details: `${database.name} runs PostgreSQL ${database.version} for database ${database.database}.`,
      category: "database",
      status: database.status,
      targetPosition: Position.Left,
      facts: {
        host: database.host,
        database: database.database,
        owner: database.owner,
        public: database.publicHostname,
      },
      sources: ["platform.edinstance.uk/v1alpha1 PostgresDatabase"],
    },
  }));

  const nodes: Array<TopologyNode> = [
    ...serviceNodes,
    ...databaseNodes,
    {
      id: "platform-frontend",
      type: "topologyNode",
      position: { x: 160, y: 240 },
      data: {
        title: "Platform frontend",
        subtitle: "TanStack Start",
        details: "The authenticated management UI and service graph.",
        category: "system",
        status: "active",
        sourcePosition: Position.Right,
        facts: { public: "ui.edinstance.uk", local: "ui.local.edinstance.uk" },
        observability: {
          namespace: "platform-system",
          app: "platform-frontend",
          workloadKind: "Deployment",
          workloadName: "platform-frontend",
        },
        sources: ["services/frontend"],
      },
    },
    {
      id: "platform-api",
      type: "topologyNode",
      position: { x: 640, y: 240 },
      data: {
        title: "Platform API",
        subtitle: "Go control plane",
        details: "Stores desired state and reconciles managed workloads.",
        category: "system",
        status: "active",
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        facts: { public: "api.edinstance.uk", namespace: "platform-system" },
        observability: {
          namespace: "platform-system",
          app: "platform-api",
          workloadKind: "Deployment",
          workloadName: "platform-api",
        },
        sources: ["services/platform-api"],
      },
    },
    {
      id: "platform-db",
      type: "topologyNode",
      position: { x: 1120, y: 240 },
      data: {
        title: "Platform PostgreSQL",
        subtitle: "3 instances + PgBouncer",
        details:
          "CloudNativePG database backing platform state and authentication.",
        category: "system",
        status: "active",
        targetPosition: Position.Left,
        facts: { version: "17", storage: "20Gi Longhorn" },
        observability: {
          namespace: "platform-db",
          app: "platform-db",
          workloadKind: "Cluster",
          workloadName: "platform-db",
        },
        sources: ["kubernetes/platform/database"],
      },
    },
  ];

  const buildEdges: Array<TopologyEdge> = [
    ...apps.map<TopologyEdge>((app) => ({
      ...edgeDefaults,
      id: `platform-api-${app.name}`,
      source: "platform-api",
      target: app.name,
      data: { flow: "runtime", label: "managed workload" },
    })),
    ...databases.map<TopologyEdge>((database) => ({
      ...edgeDefaults,
      id: `platform-api-database-${database.name}`,
      source: "platform-api",
      target: `database:${database.name}`,
      data: { flow: "runtime", label: "managed database" },
    })),
    {
      ...edgeDefaults,
      id: "platform-frontend-api",
      source: "platform-frontend",
      target: "platform-api",
      data: { flow: "runtime", label: "control requests" },
    },
    {
      ...edgeDefaults,
      id: "platform-api-db",
      source: "platform-api",
      target: "platform-db",
      data: { flow: "runtime", label: "platform state" },
    },
  ];

  return { nodes, edges: buildEdges };
}
