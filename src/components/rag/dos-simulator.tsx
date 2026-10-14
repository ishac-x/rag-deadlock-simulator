import { useEffect, useRef, useState } from "react";
import { ToolButton } from "@/components/rag/ui";
import {
  compareDosMethods,
  type DosComparison,
  type DosProcess,
  type WaitForEdge,
} from "@/lib/dos-engine";

type Speed = "slow" | "normal" | "fast";

interface DosSimulatorProps {
  active: boolean;
  stepByStep: boolean;
  speed: Speed;
  log: string[];
  addLog: (message: string) => void;
  onReportChange: (report: string) => void;
}

const COLORS = ["#d9e8ff", "#e5ddff", "#d8f0e5", "#ffe8d4", "#f8dce8"];
const SPEED_MS: Record<Speed, number> = { slow: 1100, normal: 650, fast: 300 };

export function DosSimulator({
  active,
  stepByStep,
  speed,
  log,
  addLog,
  onReportChange,
}: DosSimulatorProps) {
  const [siteCount, setSiteCount] = useState(3);
  const [processes, setProcesses] = useState<DosProcess[]>([]);
  const [edges, setEdges] = useState<WaitForEdge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [edgeTool, setEdgeTool] = useState(false);
  const [comparison, setComparison] = useState<DosComparison | null>(null);
  const [cycle, setCycle] = useState<string[]>([]);
  const [probeAt, setProbeAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uid, setUid] = useState(0);
  const probeTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (probeTimer.current !== undefined) {
        window.clearTimeout(probeTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (active) return;
    if (probeTimer.current !== undefined) {
      window.clearTimeout(probeTimer.current);
      probeTimer.current = undefined;
    }
    setBusy(false);
    setProbeAt(null);
  }, [active]);

  const invalidateResults = () => {
    setComparison(null);
    setCycle([]);
    setProbeAt(null);
    onReportChange("");
  };

  const loadExample = (name: string) => {
    let nextProcesses: DosProcess[];
    let nextEdges: WaitForEdge[];
    if (name === "ring") {
      nextProcesses = [0, 1, 2].map((site) => ({
        id: `dos-p${site + 1}`,
        label: `P${site + 1}`,
        site,
      }));
      nextEdges = [0, 1, 2].map((site) => ({
        id: `dos-e${site + 1}`,
        from: `dos-p${site + 1}`,
        to: `dos-p${((site + 1) % 3) + 1}`,
      }));
      setSiteCount(3);
    } else if (name === "chain") {
      nextProcesses = [0, 1, 2].map((site) => ({
        id: `dos-p${site + 1}`,
        label: `P${site + 1}`,
        site,
      }));
      nextEdges = [
        { id: "dos-e1", from: "dos-p1", to: "dos-p2" },
        { id: "dos-e2", from: "dos-p2", to: "dos-p3" },
      ];
      setSiteCount(3);
    } else {
      nextProcesses = Array.from({ length: 10 }, (_, index) => ({
        id: `dos-p${index + 1}`,
        label: `P${index + 1}`,
        site: Math.floor(index / 2),
      }));
      nextEdges = nextProcesses.map((process, index) => ({
        id: `dos-e${index + 1}`,
        from: process.id,
        to: nextProcesses[(index + 1) % nextProcesses.length]!.id,
      }));
      setSiteCount(5);
    }
    setProcesses(nextProcesses);
    setEdges(nextEdges);
    setUid(nextProcesses.length + 1);
    setSelected(null);
    setPendingSource(null);
    setCycle([]);
    setComparison(null);
    onReportChange("");
    addLog(`Loaded DOS example: ${name}`);
  };

  const canvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 1000;
    const y = ((event.clientY - bounds.top) / bounds.height) * 600;
    if (edgeTool) {
      setPendingSource(null);
      return;
    }
    const site = Math.min(siteCount - 1, Math.floor((x / 1000) * siteCount));
    const ordinal = processes.filter((process) => process.site === site).length;
    const id = `dos-p${uid + 1}`;
    setUid(uid + 1);
    setProcesses((current) => [...current, { id, label: `P${processes.length + 1}`, site }]);
    invalidateResults();
    setSelected(id);
    addLog(
      `P${processes.length + 1} added to Site ${site + 1} at y=${Math.round(y)} (${ordinal + 1} in lane)`,
    );
  };

  const handleProcessClick = (process: DosProcess) => {
    if (busy) return;
    setSelected(process.id);
    if (!edgeTool) return;
    if (!pendingSource) {
      setPendingSource(process.id);
      addLog(`${process.label} selected as wait-for source`);
      return;
    }
    const source = processes.find((candidate) => candidate.id === pendingSource);
    setPendingSource(null);
    if (source?.id === process.id) {
      addLog("Rejected self-edge: a process cannot wait for itself");
      return;
    }
    if (edges.some((edge) => edge.from === source?.id && edge.to === process.id)) {
      addLog(`Rejected duplicate wait-for edge ${source?.label} → ${process.label}`);
      return;
    }
    const edge = {
      id: `dos-e${edges.length + 1}-${uid}`,
      from: source!.id,
      to: process.id,
    };
    setUid(uid + 1);
    setEdges((current) => [...current, edge]);
    invalidateResults();
    addLog(`${source?.label} waits for ${process.label}`);
  };

  const getComparison = () => compareDosMethods(processes, edges, siteCount);

  const updateReport = (next: DosComparison) => {
    setComparison(next);
    onReportChange(
      [
        `DOS sites: ${siteCount}; processes: ${processes.length}; wait-for edges: ${edges.length}`,
        `Processes: ${processes.map((process) => `${process.label}@Site${process.site + 1}`).join(", ") || "none"}`,
        `Wait-for edges: ${
          edges
            .map((edge) => {
              const source = processes.find((process) => process.id === edge.from);
              const target = processes.find((process) => process.id === edge.to);
              return `${source?.label ?? edge.from} → ${target?.label ?? edge.to}`;
            })
            .join(", ") || "none"
        }`,
        `Local Check: ${next.local.verdict}; messages: 0; probes: 0; time: ${next.local.timeMs.toFixed(4)} ms; single point of failure: No`,
        ...next.local.localChecks.map((check) => `Site ${check.site + 1}: ${check.verdict}`),
        `Centralised Detection: ${next.centralised.verdict}; messages: ${next.centralised.messages}; probes: 0; time: ${next.centralised.timeMs.toFixed(4)} ms; single point of failure: Yes`,
        `Edge Chasing: ${next.edgeChasing.verdict}; messages: ${next.edgeChasing.messages}; probes: ${next.edgeChasing.totalProbes}; inter-site probes: ${next.edgeChasing.interSiteProbes}; time: ${next.edgeChasing.timeMs.toFixed(4)} ms; single point of failure: No`,
      ].join("\n"),
    );
  };

  const runLocal = () => {
    const next = getComparison();
    updateReport(next);
    setCycle(next.local.cycle);
    next.local.localChecks.forEach((check) => {
      addLog(
        `Local Check Site ${check.site + 1}: ${check.verdict === "deadlock" ? "cycle found" : "no cycle"}`,
      );
    });
  };

  const runCentral = () => {
    const next = getComparison();
    updateReport(next);
    setCycle(next.centralised.cycle);
    edges.forEach((edge) => {
      const source = processes.find((process) => process.id === edge.from);
      const target = processes.find((process) => process.id === edge.to);
      addLog(
        `Coordinator message: ${source?.label ?? edge.from} waits for ${target?.label ?? edge.to}`,
      );
    });
    addLog(
      `Centralised Detection: ${next.centralised.messages} coordinator messages; ${next.centralised.verdict}`,
    );
    if (next.centralised.cycle.length > 0) {
      addLog(
        `Cycle detected: ${next.centralised.cycle.map((id) => processes.find((process) => process.id === id)?.label ?? id).join(" → ")}`,
      );
    }
  };

  const runEdgeChasing = () => {
    const next = getComparison();
    updateReport(next);
    setCycle(next.edgeChasing.verdict === "deadlock" ? next.centralised.cycle : []);
    const probes = next.edgeChasing.probeLog;
    addLog(`Edge Chasing started: ${probes.length} probes`);
    setBusy(probes.length > 0 && stepByStep && processes.length <= 30);
    if (probes.length === 0 || !stepByStep || processes.length > 30) {
      probes.forEach(addLog);
      setBusy(false);
      addLog(`Edge Chasing: ${next.edgeChasing.verdict}`);
      return;
    }
    let index = 0;
    const replay = () => {
      const line = probes[index];
      if (!line) {
        setProbeAt(null);
        setBusy(false);
        addLog(`Edge Chasing: ${next.edgeChasing.verdict}`);
        return;
      }
      addLog(line);
      const match = /\(([^,]+), ([^,]+), ([^)]+)\)/.exec(line);
      setProbeAt(match?.[3] ?? null);
      index += 1;
      probeTimer.current = window.setTimeout(replay, SPEED_MS[speed]);
    };
    replay();
  };

  const moveSelected = (site: number) => {
    const process = processes.find((candidate) => candidate.id === selected);
    if (!process || process.site === site) return;
    setProcesses((current) =>
      current.map((candidate) =>
        candidate.id === process.id ? { ...candidate, site } : candidate,
      ),
    );
    invalidateResults();
    addLog(`${process.label} moved to Site ${site + 1}`);
  };

  const positions = new Map<string, { x: number; y: number }>();
  for (let site = 0; site < siteCount; site += 1) {
    const laneProcesses = processes.filter((process) => process.site === site);
    laneProcesses.forEach((process, index) => {
      positions.set(process.id, {
        x: ((site + 0.5) / siteCount) * 1000,
        y: 90 + (index * 460) / Math.max(1, laneProcesses.length - 1),
      });
    });
  }
  const edgeHighlighted = new Set(
    cycle.flatMap((from, index) => {
      const to = cycle[(index + 1) % cycle.length];
      const match = edges.find((edge) => edge.from === from && edge.to === to);
      return match ? [match.id] : [];
    }),
  );
  const selectedProcess = processes.find((process) => process.id === selected);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <main className="min-h-[360px] min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <label className="text-xs text-muted-foreground">
            Sites{" "}
            <select
              className="rounded border border-border bg-surface px-2 py-1 text-foreground"
              value={siteCount}
              disabled={busy}
              onChange={(event) => {
                const count = Number(event.target.value);
                setSiteCount(count);
                setProcesses((current) =>
                  current.map((process) => ({
                    ...process,
                    site: Math.min(process.site, count - 1),
                  })),
                );
                invalidateResults();
              }}
            >
              {[3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Load DOS Example{" "}
            <select
              className="rounded border border-border bg-surface px-2 py-1 text-foreground"
              defaultValue=""
              disabled={busy}
              onChange={(event) => {
                if (event.target.value) loadExample(event.target.value);
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              <option value="ring">3-site ring</option>
              <option value="chain">3-site chain</option>
              <option value="ten-ring">5 sites, 10-process ring</option>
            </select>
          </label>
          <ToolButton
            active={!edgeTool}
            disabled={busy}
            onClick={() => {
              setEdgeTool(false);
              setPendingSource(null);
            }}
          >
            Add Process
          </ToolButton>
          <ToolButton
            active={edgeTool}
            disabled={busy}
            onClick={() => {
              setEdgeTool((active) => !active);
              setPendingSource(null);
            }}
          >
            Wait-For Edge
          </ToolButton>
          <ToolButton disabled={busy} onClick={runLocal}>
            Local Check
          </ToolButton>
          <ToolButton disabled={busy} onClick={runCentral}>
            Centralised Detection
          </ToolButton>
          <ToolButton disabled={busy} onClick={runEdgeChasing}>
            Edge Chasing
          </ToolButton>
          <ToolButton
            disabled={busy}
            onClick={() => {
              setProcesses([]);
              setEdges([]);
              setSelected(null);
              setPendingSource(null);
              invalidateResults();
              addLog("DOS graph reset");
            }}
          >
            Reset DOS Graph
          </ToolButton>
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {edgeTool
            ? pendingSource
              ? "Select the process this one waits for."
              : "Select a source process, then the process it waits for."
            : "Click a lane to add a process to that site."}
        </p>
        <div className="h-[calc(100%-48px)] min-h-[300px] overflow-hidden rounded-lg border border-border bg-canvas">
          <svg
            className="h-full w-full"
            viewBox="0 0 1000 600"
            onClick={canvasClick}
            preserveAspectRatio="none"
          >
            <defs>
              <marker
                id="dos-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#596273" />
              </marker>
              <marker
                id="dos-arrow-cross"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#9b5b34" />
              </marker>
            </defs>
            {Array.from({ length: siteCount }, (_, site) => (
              <g key={site} pointerEvents="none">
                <rect
                  x={(site * 1000) / siteCount}
                  y="0"
                  width={1000 / siteCount}
                  height="600"
                  fill={COLORS[site]}
                  opacity="0.46"
                />
                <line
                  x1={(site * 1000) / siteCount}
                  y1="0"
                  x2={(site * 1000) / siteCount}
                  y2="600"
                  stroke="#b8bec8"
                  strokeDasharray="5 5"
                />
                <text
                  x={((site + 0.5) * 1000) / siteCount}
                  y="30"
                  textAnchor="middle"
                  fill="#344054"
                  fontSize="16"
                >
                  Site {site + 1}
                </text>
              </g>
            ))}
            {edges.map((edge) => {
              const from = positions.get(edge.from);
              const to = positions.get(edge.to);
              const crossSite =
                processes.find((process) => process.id === edge.from)?.site !==
                processes.find((process) => process.id === edge.to)?.site;
              if (!from || !to) return null;
              return (
                <g key={edge.id}>
                  <path
                    d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                    stroke={
                      edgeHighlighted.has(edge.id) ? "#d22" : crossSite ? "#9b5b34" : "#596273"
                    }
                    strokeWidth={edgeHighlighted.has(edge.id) ? 4 : 2}
                    strokeDasharray={crossSite ? "8 6" : undefined}
                    markerEnd={`url(#${crossSite ? "dos-arrow-cross" : "dos-arrow"})`}
                  />
                </g>
              );
            })}
            {processes.map((process) => {
              const position = positions.get(process.id);
              if (!position) return null;
              const active =
                process.id === selected ||
                process.id === pendingSource ||
                probeAt === process.label;
              return (
                <g
                  key={process.id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleProcessClick(process);
                  }}
                >
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r="28"
                    fill={active ? "#b9d8ff" : "#f4f7fb"}
                    stroke="#5d6a7d"
                    strokeWidth="2"
                  />
                  <text
                    x={position.x}
                    y={position.y + 5}
                    textAnchor="middle"
                    fill="#202938"
                    fontSize="14"
                  >
                    {process.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </main>
      <aside className="w-full overflow-y-auto border-t border-border bg-surface-strong p-4 lg:w-[380px] lg:border-l lg:border-t-0">
        <p className="mb-3 rounded-md border border-border bg-surface p-3 text-sm">
          Local checks can miss deadlocks that span sites.
        </p>
        {selectedProcess ? (
          <div className="mb-4 rounded-md border border-border bg-surface p-3">
            <div className="mb-2 font-mono text-sm">
              {selectedProcess.label} · Site {selectedProcess.site + 1}
            </div>
            <label className="text-xs text-muted-foreground">
              Move to{" "}
              <select
                className="rounded border border-border bg-surface px-2 py-1 text-foreground"
                value={selectedProcess.site}
                disabled={busy}
                onChange={(event) => moveSelected(Number(event.target.value))}
              >
                {Array.from({ length: siteCount }, (_, site) => (
                  <option key={site} value={site}>
                    Site {site + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          DOS Comparison
        </h2>
        {comparison ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-1">Method</th>
                    <th className="p-1">Verdict</th>
                    <th className="p-1">Messages</th>
                    <th className="p-1">Total probes</th>
                    <th className="p-1">Time (ms)</th>
                    <th className="p-1">Single point of failure</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Local Check", comparison.local, "No"],
                      ["Centralised", comparison.centralised, "Yes"],
                      ["Edge Chasing", comparison.edgeChasing, "No"],
                    ] as const
                  ).map(([method, result, failure]) => (
                    <tr key={method} className="border-b border-border">
                      <td className="p-1">{method}</td>
                      <td className="p-1">{result.verdict}</td>
                      <td className="p-1">{result.messages}</td>
                      <td className="p-1">{result.totalProbes}</td>
                      <td className="p-1">{result.timeMs.toFixed(4)}</td>
                      <td className="p-1">{failure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Local checks {comparison.agree ? "agree" : "do not all agree"} with distributed
              detection.
            </p>
            {comparison.local.localChecks.map((check) => (
              <p key={check.site} className="mt-1 text-xs">
                Site {check.site + 1}: {check.verdict}
              </p>
            ))}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Run a DOS detection method to see results.
          </p>
        )}
        <section className="mt-4 flex min-h-0 flex-1 flex-col rounded-md border border-border bg-surface">
          <h2 className="border-b border-border px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Log
          </h2>
          <div className="max-h-[40vh] overflow-y-auto px-3 py-2">
            {log.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No activity yet. Add a process to start.
              </p>
            ) : (
              <ul className="space-y-1">
                {log.slice(-100).map((entry, index) => (
                  <li key={`${index}-${entry}`} className="font-mono text-xs">
                    {entry}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
