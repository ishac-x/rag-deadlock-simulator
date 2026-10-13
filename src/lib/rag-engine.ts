export type NodeType = "process" | "resource";
export type EdgeType = "request" | "assignment";

export interface RagNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  instances: number;
}

export interface RagEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
}

export type DetectionStatus =
  | "idle"
  | "no-cycle"
  | "deadlock"
  | "checking-safety"
  | "safe";

export interface DetectionResult {
  status: Exclude<DetectionStatus, "idle" | "checking-safety">;
  multiInstance: boolean;
  cycle: string[];
  cycleNodeIds: string[];
  cycleEdgeIds: string[];
}

export function isMultiInstance(nodes: RagNode[]): boolean {
  return nodes.some((n) => n.type === "resource" && n.instances > 1);
}

function buildAdjacency(edges: RagEdge[]) {
  const adj = new Map<string, { to: string; edgeId: string }[]>();
  for (const e of edges) {
    const list = adj.get(e.from) ?? [];
    list.push({ to: e.to, edgeId: e.id });
    adj.set(e.from, list);
  }
  return adj;
}

/** Depth-first search for a directed cycle. Returns node ids in cycle order. */
export function findCycle(nodes: RagNode[], edges: RagEdge[]): string[] {
  const adj = buildAdjacency(edges);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let found: string[] | null = null;

  const visit = (id: string): boolean => {
    state.set(id, 1);
    stack.push(id);
    for (const { to } of adj.get(id) ?? []) {
      const s = state.get(to) ?? 0;
      if (s === 1) {
        const start = stack.indexOf(to);
        found = stack.slice(start);
        return true;
      }
      if (s === 0 && visit(to)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };

  for (const n of nodes) {
    if ((state.get(n.id) ?? 0) === 0) {
      if (visit(n.id)) break;
    }
  }
  return found ?? [];
}

function cycleEdgeIds(cycle: string[], edges: RagEdge[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < cycle.length; i++) {
    const from = cycle[i] as string;
    const to = cycle[(i + 1) % cycle.length] as string;
    const edge = edges.find((e) => e.from === from && e.to === to);
    if (edge) ids.push(edge.id);
  }
  return ids;
}

/**
 * Graph reduction for multi-instance graphs.
 * Returns true when every process can be reduced (no true deadlock).
 */
export function canFullyReduce(nodes: RagNode[], edges: RagEdge[]): boolean {
  const resources = nodes.filter((n) => n.type === "resource");
  const processes = nodes.filter((n) => n.type === "process");

  const available = new Map<string, number>();
  for (const r of resources) {
    const allocated = edges.filter(
      (e) => e.type === "assignment" && e.from === r.id,
    ).length;
    available.set(r.id, r.instances - allocated);
  }

  const reduced = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const p of processes) {
      if (reduced.has(p.id)) continue;
      const requests = edges.filter(
        (e) => e.type === "request" && e.from === p.id,
      );
      const need = new Map<string, number>();
      for (const req of requests) {
        need.set(req.to, (need.get(req.to) ?? 0) + 1);
      }
      let satisfiable = true;
      for (const [rid, count] of need) {
        if ((available.get(rid) ?? 0) < count) {
          satisfiable = false;
          break;
        }
      }
      if (!satisfiable) continue;

      for (const e of edges) {
        if (e.type === "assignment" && e.to === p.id) {
          available.set(e.from, (available.get(e.from) ?? 0) + 1);
        }
      }
      reduced.add(p.id);
      progress = true;
    }
  }
  return reduced.size === processes.length;
}

export function detect(nodes: RagNode[], edges: RagEdge[]): DetectionResult {
  const multi = isMultiInstance(nodes);
  const cycle = findCycle(nodes, edges);

  if (cycle.length === 0) {
    return {
      status: "no-cycle",
      multiInstance: multi,
      cycle: [],
      cycleNodeIds: [],
      cycleEdgeIds: [],
    };
  }

  const nodeIds = cycle;
  const edgeIds = cycleEdgeIds(cycle, edges);

  if (!multi) {
    return {
      status: "deadlock",
      multiInstance: false,
      cycle,
      cycleNodeIds: nodeIds,
      cycleEdgeIds: edgeIds,
    };
  }

  const safe = canFullyReduce(nodes, edges);
  return {
    status: safe ? "safe" : "deadlock",
    multiInstance: true,
    cycle,
    cycleNodeIds: nodeIds,
    cycleEdgeIds: edgeIds,
  };
}

export function cyclePath(cycle: string[], nodes: RagNode[]): string {
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const ids: string[] = [...cycle, cycle[0] ?? ""];
  return ids.map((id) => label(id)).join(" \u2192 ");
}
