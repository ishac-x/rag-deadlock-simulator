export type NodeType = "process" | "resource";
export type EdgeType = "request" | "assignment";
export type Algorithm = "auto" | "dfs" | "reduction" | "ranked";

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

export type DetectionStatus = "idle" | "no-cycle" | "deadlock" | "checking-safety" | "safe";

export interface DetectionResult {
  status: Exclude<DetectionStatus, "idle" | "checking-safety">;
  multiInstance: boolean;
  cycle: string[];
  cycleNodeIds: string[];
  cycleEdgeIds: string[];
}

export interface AlgorithmMetrics {
  algorithm: Algorithm;
  verdict: "deadlock" | "safe" | "no-cycle" | "inconclusive";
  nodesVisited: number;
  edgesExamined: number;
  checks: number;
  passes: number;
  reductions: number;
  remainingProcesses: string[];
  cycle: string[];
  cycleNodeIds: string[];
  cycleEdgeIds: string[];
  multiInstance: boolean;
  note?: string;
  timeMs: number;
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
  return reductionMetrics(nodes, edges, false).remainingProcesses.length === 0;
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

function reductionMetrics(
  nodes: RagNode[],
  edges: RagEdge[],
  ranked: boolean,
): Pick<AlgorithmMetrics, "checks" | "passes" | "reductions" | "remainingProcesses"> {
  const resources = nodes.filter((n) => n.type === "resource");
  const processes = nodes.filter((n) => n.type === "process");
  const available = new Map<string, number>();
  for (const resource of resources) {
    available.set(resource.id, resource.instances);
  }

  const requests = new Map<string, Map<string, number>>();
  const holdings = new Map<string, string[]>();
  for (const process of processes) {
    requests.set(process.id, new Map());
    holdings.set(process.id, []);
  }
  for (const edge of edges) {
    if (edge.type === "request" && requests.has(edge.from)) {
      const need = requests.get(edge.from);
      if (need) need.set(edge.to, (need.get(edge.to) ?? 0) + 1);
    } else if (edge.type === "assignment") {
      if (available.has(edge.from)) {
        available.set(edge.from, (available.get(edge.from) ?? 0) - 1);
      }
      holdings.get(edge.to)?.push(edge.from);
    }
  }

  const order = ranked
    ? [...processes].sort(
        (a, b) =>
          [...(requests.get(a.id)?.values() ?? [])].reduce((sum, count) => sum + count, 0) -
          [...(requests.get(b.id)?.values() ?? [])].reduce((sum, count) => sum + count, 0),
      )
    : processes;
  const unfinished = new Set(processes.map((process) => process.id));
  let checks = 0;
  let passes = 0;
  let reductions = 0;

  while (unfinished.size > 0) {
    passes += 1;
    let reducedThisPass = false;
    for (const process of order) {
      if (!unfinished.has(process.id)) continue;
      checks += 1;
      const need = requests.get(process.id) ?? new Map();
      const canFinish = [...need].every(
        ([resourceId, count]) => (available.get(resourceId) ?? 0) >= count,
      );
      if (!canFinish) continue;

      for (const resourceId of holdings.get(process.id) ?? []) {
        available.set(resourceId, (available.get(resourceId) ?? 0) + 1);
      }
      unfinished.delete(process.id);
      reductions += 1;
      reducedThisPass = true;
    }
    if (!reducedThisPass) break;
  }

  return {
    checks,
    passes,
    reductions,
    remainingProcesses: processes
      .filter((process) => unfinished.has(process.id))
      .map((process) => process.label),
  };
}

function executeAlgorithm(
  algorithm: Algorithm,
  nodes: RagNode[],
  edges: RagEdge[],
): Omit<AlgorithmMetrics, "timeMs"> {
  const multiInstance = isMultiInstance(nodes);
  if (algorithm === "dfs") {
    const dfs = findCycleCounted(nodes, edges);
    return {
      algorithm,
      multiInstance,
      ...dfs,
      cycleNodeIds: dfs.cycle,
      checks: 0,
      passes: 0,
      reductions: 0,
      remainingProcesses: [],
      verdict: dfs.cycle.length === 0 ? "no-cycle" : multiInstance ? "inconclusive" : "deadlock",
      ...(multiInstance && dfs.cycle.length > 0
        ? { note: "A cycle is not always a deadlock with multiple instances." }
        : {}),
    };
  }

  if (algorithm === "reduction" || algorithm === "ranked") {
    const reduction = reductionMetrics(nodes, edges, algorithm === "ranked");
    return {
      algorithm,
      multiInstance,
      cycle: [],
      cycleNodeIds: [],
      cycleEdgeIds: [],
      nodesVisited: 0,
      edgesExamined: 0,
      ...reduction,
      verdict: reduction.remainingProcesses.length > 0 ? "deadlock" : "safe",
    };
  }

  const result = detect(nodes, edges);
  return {
    algorithm,
    multiInstance,
    nodesVisited: 0,
    edgesExamined: 0,
    checks: 0,
    passes: 0,
    reductions: 0,
    remainingProcesses: [],
    verdict:
      result.status === "deadlock" ? "deadlock" : result.status === "safe" ? "safe" : "no-cycle",
    cycle: result.cycle,
    cycleNodeIds: result.cycleNodeIds,
    cycleEdgeIds: result.cycleEdgeIds,
  };
}

function findCycleCounted(
  nodes: RagNode[],
  edges: RagEdge[],
): {
  cycle: string[];
  cycleEdgeIds: string[];
  nodesVisited: number;
  edgesExamined: number;
} {
  const adjacency = buildAdjacency(edges);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] = [];
  let nodesVisited = 0;
  let edgesExamined = 0;
  const visit = (id: string): boolean => {
    state.set(id, 1);
    stack.push(id);
    nodesVisited += 1;
    for (const { to } of adjacency.get(id) ?? []) {
      edgesExamined += 1;
      const targetState = state.get(to) ?? 0;
      if (targetState === 1) {
        cycle = stack.slice(stack.indexOf(to));
        return true;
      }
      if (targetState === 0 && visit(to)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const node of nodes) {
    if ((state.get(node.id) ?? 0) === 0 && visit(node.id)) break;
  }
  return {
    cycle,
    cycleEdgeIds: cycle.flatMap((from, index) => {
      const to = cycle[(index + 1) % cycle.length];
      const edge = edges.find((candidate) => candidate.from === from && candidate.to === to);
      return edge ? [edge.id] : [];
    }),
    nodesVisited,
    edgesExamined,
  };
}

/** Execute an algorithm and report the mean runtime over 200 repetitions. */
export function runAlgorithm(
  algorithm: Algorithm,
  nodes: RagNode[],
  edges: RagEdge[],
): AlgorithmMetrics {
  const repetitions = 200;
  const started = performance.now();
  let result: Omit<AlgorithmMetrics, "timeMs"> | undefined;
  for (let iteration = 0; iteration < repetitions; iteration += 1) {
    result = executeAlgorithm(algorithm, nodes, edges);
  }
  if (algorithm === "auto" && result?.multiInstance && result.cycle.length > 0) {
    result = { ...result, ...reductionMetrics(nodes, edges, false) };
  }
  if (algorithm === "reduction" || algorithm === "ranked") {
    const cycle = findCycle(nodes, edges);
    result = {
      ...result!,
      cycle,
      cycleNodeIds: cycle,
      cycleEdgeIds: cycle.flatMap((from, index) => {
        const to = cycle[(index + 1) % cycle.length];
        const edge = edges.find((candidate) => candidate.from === from && candidate.to === to);
        return edge ? [edge.id] : [];
      }),
    };
  }
  return {
    ...result!,
    timeMs: (performance.now() - started) / repetitions,
  };
}

export function cyclePath(cycle: string[], nodes: RagNode[]): string {
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const ids: string[] = [...cycle, cycle[0] ?? ""];
  return ids.map((id) => label(id)).join(" \u2192 ");
}
