export interface DosProcess {
  id: string;
  label: string;
  site: number;
}

export interface WaitForEdge {
  id: string;
  from: string;
  to: string;
}

export interface LocalCheckResult {
  site: number;
  verdict: "deadlock" | "no-cycle";
  cycle: string[];
}

export interface DosMethodResult {
  verdict: "deadlock" | "no-cycle";
  messages: number;
  totalProbes: number;
  interSiteProbes: number;
  timeMs: number;
  cycle: string[];
  localChecks: LocalCheckResult[];
  probeLog: string[];
}

export interface DosComparison {
  local: DosMethodResult;
  centralised: DosMethodResult;
  edgeChasing: DosMethodResult;
  agree: boolean;
}

function findCycle(
  processes: DosProcess[],
  edges: WaitForEdge[],
): { cycle: string[]; nodesVisited: number; edgesExamined: number } {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.from) ?? [];
    outgoing.push(edge.to);
    adjacency.set(edge.from, outgoing);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] = [];
  let nodesVisited = 0;
  let edgesExamined = 0;
  const visit = (id: string): boolean => {
    state.set(id, 1);
    stack.push(id);
    nodesVisited += 1;
    for (const target of adjacency.get(id) ?? []) {
      edgesExamined += 1;
      if ((state.get(target) ?? 0) === 1) {
        cycle = stack.slice(stack.indexOf(target));
        return true;
      }
      if ((state.get(target) ?? 0) === 0 && visit(target)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const process of processes) {
    if ((state.get(process.id) ?? 0) === 0 && visit(process.id)) break;
  }
  return { cycle, nodesVisited, edgesExamined };
}

function getLocalChecks(
  processes: DosProcess[],
  edges: WaitForEdge[],
  siteCount: number,
): LocalCheckResult[] {
  return Array.from({ length: siteCount }, (_, site) => {
    const localProcesses = processes.filter((process) => process.site === site);
    const localIds = new Set(localProcesses.map((process) => process.id));
    const localEdges = edges.filter((edge) => localIds.has(edge.from) && localIds.has(edge.to));
    const { cycle } = findCycle(localProcesses, localEdges);
    return {
      site,
      verdict: cycle.length > 0 ? "deadlock" : "no-cycle",
      cycle,
    };
  });
}

function runCentralised(
  processes: DosProcess[],
  edges: WaitForEdge[],
): Omit<DosMethodResult, "timeMs" | "localChecks" | "probeLog"> {
  const blocked = new Set(edges.map((edge) => edge.from));
  const reportedEdges = edges.filter((edge) => blocked.has(edge.from));
  const { cycle } = findCycle(processes, reportedEdges);
  return {
    verdict: cycle.length > 0 ? "deadlock" : "no-cycle",
    messages: reportedEdges.length,
    totalProbes: 0,
    interSiteProbes: 0,
    cycle,
  };
}

function runEdgeChasing(
  processes: DosProcess[],
  edges: WaitForEdge[],
): Omit<DosMethodResult, "timeMs" | "localChecks"> {
  const byId = new Map(processes.map((process) => [process.id, process]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }

  let totalProbes = 0;
  let interSiteProbes = 0;
  const probeLog: string[] = [];
  for (const initiator of processes) {
    if (!outgoing.get(initiator.id)?.length) continue;
    const forwarded = new Set<string>([initiator.id]);
    const queue = (outgoing.get(initiator.id) ?? []).map((receiver) => ({
      sender: initiator.id,
      receiver,
    }));
    while (queue.length > 0) {
      const probe = queue.shift();
      if (!probe) continue;
      totalProbes += 1;
      const sender = byId.get(probe.sender);
      const receiver = byId.get(probe.receiver);
      if (sender && receiver && sender.site !== receiver.site) {
        interSiteProbes += 1;
      }
      const line = `probe (${initiator.label}, ${sender?.label ?? probe.sender}, ${receiver?.label ?? probe.receiver})`;
      probeLog.push(line);
      if (probe.receiver === initiator.id) {
        return {
          verdict: "deadlock",
          messages: totalProbes,
          totalProbes,
          interSiteProbes,
          cycle: [],
          probeLog,
        };
      }
      if (forwarded.has(probe.receiver)) continue;
      forwarded.add(probe.receiver);
      for (const receiver of outgoing.get(probe.receiver) ?? []) {
        queue.push({ sender: probe.receiver, receiver });
      }
    }
  }
  return {
    verdict: "no-cycle",
    messages: totalProbes,
    totalProbes,
    interSiteProbes,
    cycle: [],
    probeLog,
  };
}

/** Run local checks, coordinator detection, and edge chasing with averaged timings. */
export function compareDosMethods(
  processes: DosProcess[],
  edges: WaitForEdge[],
  siteCount: number,
): DosComparison {
  const repetitions = 200;
  const localStart = performance.now();
  let localChecks: LocalCheckResult[] = [];
  for (let iteration = 0; iteration < repetitions; iteration += 1) {
    localChecks = getLocalChecks(processes, edges, siteCount);
  }
  const localTime = (performance.now() - localStart) / repetitions;

  const centralStart = performance.now();
  let central = runCentralised(processes, edges);
  for (let iteration = 1; iteration < repetitions; iteration += 1) {
    central = runCentralised(processes, edges);
  }
  const centralTime = (performance.now() - centralStart) / repetitions;

  const chasingStart = performance.now();
  let chasing = runEdgeChasing(processes, edges);
  for (let iteration = 1; iteration < repetitions; iteration += 1) {
    chasing = runEdgeChasing(processes, edges);
  }
  const chasingTime = (performance.now() - chasingStart) / repetitions;

  const localVerdict = localChecks.some((check) => check.verdict === "deadlock")
    ? "deadlock"
    : "no-cycle";
  return {
    local: {
      verdict: localVerdict,
      messages: 0,
      totalProbes: 0,
      interSiteProbes: 0,
      timeMs: localTime,
      cycle: localChecks.find((check) => check.cycle.length > 0)?.cycle ?? [],
      localChecks,
      probeLog: [],
    },
    centralised: {
      ...central,
      timeMs: centralTime,
      localChecks,
      probeLog: [],
    },
    edgeChasing: {
      ...chasing,
      timeMs: chasingTime,
      localChecks,
    },
    agree: localVerdict === central.verdict && central.verdict === chasing.verdict,
  };
}
