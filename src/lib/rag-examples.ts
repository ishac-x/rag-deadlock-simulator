import type { RagEdge, RagNode } from "@/lib/rag-engine";

export interface RagGraph {
  nodes: RagNode[];
  edges: RagEdge[];
}

export const RAG_EXAMPLES: Record<string, RagGraph> = {
  classic: {
    nodes: [
      { id: "p1", type: "process", label: "P1", x: 180, y: 160, instances: 1 },
      { id: "p2", type: "process", label: "P2", x: 470, y: 330, instances: 1 },
      { id: "p3", type: "process", label: "P3", x: 180, y: 500, instances: 1 },
      { id: "r1", type: "resource", label: "R1", x: 90, y: 330, instances: 1 },
      { id: "r2", type: "resource", label: "R2", x: 325, y: 160, instances: 1 },
      { id: "r3", type: "resource", label: "R3", x: 325, y: 500, instances: 1 },
    ],
    edges: [
      { id: "e1", from: "p1", to: "r2", type: "request" },
      { id: "e2", from: "r2", to: "p2", type: "assignment" },
      { id: "e3", from: "p2", to: "r3", type: "request" },
      { id: "e4", from: "r3", to: "p3", type: "assignment" },
      { id: "e5", from: "p3", to: "r1", type: "request" },
      { id: "e6", from: "r1", to: "p1", type: "assignment" },
    ],
  },
  safeMulti: {
    nodes: [
      { id: "p1", type: "process", label: "P1", x: 180, y: 180, instances: 1 },
      { id: "p2", type: "process", label: "P2", x: 430, y: 420, instances: 1 },
      { id: "r1", type: "resource", label: "R1", x: 100, y: 420, instances: 2 },
      { id: "r2", type: "resource", label: "R2", x: 430, y: 180, instances: 1 },
    ],
    edges: [
      { id: "e1", from: "r1", to: "p1", type: "assignment" },
      { id: "e2", from: "r2", to: "p2", type: "assignment" },
      { id: "e3", from: "p1", to: "r2", type: "request" },
      { id: "e4", from: "p2", to: "r1", type: "request" },
    ],
  },
  multiDeadlock: {
    nodes: [
      { id: "p1", type: "process", label: "P1", x: 180, y: 180, instances: 1 },
      { id: "p2", type: "process", label: "P2", x: 430, y: 420, instances: 1 },
      { id: "r1", type: "resource", label: "R1", x: 100, y: 420, instances: 2 },
      { id: "r2", type: "resource", label: "R2", x: 430, y: 180, instances: 2 },
    ],
    edges: [
      { id: "e1", from: "r1", to: "p1", type: "assignment" },
      { id: "e2", from: "r1", to: "p2", type: "assignment" },
      { id: "e3", from: "r2", to: "p1", type: "assignment" },
      { id: "e4", from: "r2", to: "p2", type: "assignment" },
      { id: "e5", from: "p1", to: "r1", type: "request" },
      { id: "e6", from: "p2", to: "r2", type: "request" },
    ],
  },
  noCycle: {
    nodes: [
      { id: "p1", type: "process", label: "P1", x: 180, y: 250, instances: 1 },
      { id: "r1", type: "resource", label: "R1", x: 360, y: 250, instances: 1 },
      { id: "r2", type: "resource", label: "R2", x: 560, y: 250, instances: 1 },
    ],
    edges: [
      { id: "r1-p1", from: "r1", to: "p1", type: "assignment" },
      { id: "p1-r2", from: "p1", to: "r2", type: "request" },
    ],
  },
};

export function createRandomGraph(
  processCount: number,
  resourceCount: number,
  random: () => number = Math.random,
): RagGraph {
  const total = processCount + resourceCount;
  const columns = Math.ceil(Math.sqrt(total));
  const nodes: RagNode[] = [];
  for (let index = 0; index < total; index += 1) {
    const process = index < processCount;
    const localIndex = process ? index : index - processCount;
    const row = Math.floor(index / columns);
    const column = index % columns;
    nodes.push({
      id: `${process ? "process" : "resource"}-${localIndex + 1}`,
      type: process ? "process" : "resource",
      label: `${process ? "P" : "R"}${localIndex + 1}`,
      x: 55 + column * 90,
      y: 55 + row * 82,
      instances: process ? 1 : 1 + Math.floor(random() * 3),
    });
  }

  const processes = nodes.filter((node) => node.type === "process");
  const resources = nodes.filter((node) => node.type === "resource");
  const edges: RagEdge[] = [];
  let edgeId = 0;
  for (const process of processes) {
    if (resources.length > 0 && random() < 0.55) {
      const resource = resources[Math.floor(random() * resources.length)];
      if (resource) {
        edges.push({
          id: `random-edge-${++edgeId}`,
          from: process.id,
          to: resource.id,
          type: "request",
        });
      }
    }
  }
  for (const resource of resources) {
    const candidates = [...processes].sort(() => random() - 0.5);
    const allocationCount = Math.min(
      resource.instances,
      Math.floor(random() * Math.min(3, processes.length + 1)),
    );
    for (const process of candidates.slice(0, allocationCount)) {
      edges.push({
        id: `random-edge-${++edgeId}`,
        from: resource.id,
        to: process.id,
        type: "assignment",
      });
    }
  }
  return { nodes, edges };
}
