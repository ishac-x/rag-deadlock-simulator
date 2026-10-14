import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AddCircleIcon,
  AddSquareIcon,
  Alert02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Download01Icon,
  MinusSignIcon,
  PlayIcon,
  PlusSignIcon,
  RefreshIcon,
  SearchIcon,
  TimeQuarterIcon,
} from "@hugeicons/core-free-icons";
import {
  Panel,
  PanelSection,
  Stat,
  StatusBadge,
  ToolButton,
  type BadgeTone,
} from "@/components/rag/ui";
import { FadeIn, FadeScaleIn, GrowLine, PulseOnce } from "@/components/animate-ui/primitives";
import {
  cyclePath,
  detect,
  isMultiInstance,
  runAlgorithm,
  type Algorithm,
  type AlgorithmMetrics,
  type DetectionResult,
  type RagEdge,
  type RagNode,
} from "@/lib/rag-engine";
import { createRandomGraph, RAG_EXAMPLES } from "@/lib/rag-examples";
import { DosSimulator } from "@/components/rag/dos-simulator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Resource Allocation Graph Deadlock Simulator" },
      {
        name: "description",
        content:
          "Place process and resource nodes, draw request and assignment edges, and detect deadlock cycles in real time.",
      },
      {
        property: "og:title",
        content: "Resource Allocation Graph Deadlock Simulator",
      },
      {
        property: "og:description",
        content:
          "Build a resource allocation graph and run cycle and reduction based deadlock detection.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Simulator,
});

type Tool = "process" | "resource" | "request" | "assignment";
type Speed = "slow" | "normal" | "fast";
type Selection = { kind: "node" | "edge"; id: string } | null;

interface LogEntry {
  id: number;
  text: string;
}

const PROCESS_R = 28;
const RES_W = 70;
const RES_H = 52;

const SPEED_FACTOR: Record<Speed, number> = {
  slow: 1.8,
  normal: 1,
  fast: 0.5,
};

function anchorPoint(from: RagNode, to: RagNode) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  if (from.type === "process") {
    const r = PROCESS_R + 4;
    return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
  }
  const hw = RES_W / 2 + 4;
  const hh = RES_H / 2 + 4;
  const scale = Math.min(
    Math.abs(dx) < 0.001 ? Infinity : hw / Math.abs(dx),
    Math.abs(dy) < 0.001 ? Infinity : hh / Math.abs(dy),
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

function Simulator() {
  const [tool, setTool] = useState<Tool>("process");
  const [nodes, setNodes] = useState<RagNode[]>([]);
  const [edges, setEdges] = useState<RagEdge[]>([]);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [stepByStep, setStepByStep] = useState(true);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [confirmReset, setConfirmReset] = useState(false);
  const [mode, setMode] = useState<"single" | "dos">("single");
  const [algorithm, setAlgorithm] = useState<Algorithm>("auto");
  const [algorithmResult, setAlgorithmResult] = useState<AlgorithmMetrics | null>(null);
  const [comparison, setComparison] = useState<AlgorithmMetrics[] | null>(null);
  const [example, setExample] = useState("");
  const [processInput, setProcessInput] = useState("5");
  const [resourceInput, setResourceInput] = useState("3");
  const [randomError, setRandomError] = useState("");
  const [dosReport, setDosReport] = useState("");

  const logId = useRef(0);
  const uid = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const factor = SPEED_FACTOR[speed];

  const addLog = useCallback((text: string) => {
    logId.current += 1;
    setLog((prev) => [...prev, { id: logId.current, text }].slice(-200));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const nodeById = useCallback((id: string) => nodes.find((n) => n.id === id), [nodes]);
  const checksFor = (row: AlgorithmMetrics) =>
    row.algorithm === "dfs" ? row.nodesVisited + row.edgesExamined : row.checks;

  const runDetection = useCallback(
    (nextNodes: RagNode[], nextEdges: RagEdge[]) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (nextNodes.length === 0) {
        setResult(null);
        setAlgorithmResult(null);
        addLog("Nothing to analyse");
        return;
      }
      addLog("Checking cycles...");
      const metrics = runAlgorithm(algorithm, nextNodes, nextEdges);
      const detected = detect(nextNodes, nextEdges);
      const outcome: DetectionResult = {
        status:
          metrics.verdict === "deadlock"
            ? "deadlock"
            : metrics.verdict === "safe"
              ? "safe"
              : "no-cycle",
        multiInstance: metrics.multiInstance,
        cycle: metrics.cycle,
        cycleNodeIds: metrics.cycleNodeIds,
        cycleEdgeIds: metrics.cycleEdgeIds,
      };
      if (algorithm === "auto") {
        outcome.status = detected.status;
        outcome.cycle = detected.cycle;
        outcome.cycleNodeIds = detected.cycleNodeIds;
        outcome.cycleEdgeIds = detected.cycleEdgeIds;
      }
      setAlgorithmResult(metrics);

      const finish = () => {
        timer.current = null;
        setChecking(false);
        setResult(outcome);
        setPulseKey((k) => k + 1);
        if (metrics.cycle.length === 0) {
          addLog(
            metrics.verdict === "safe"
              ? "No cycle found; reduction completed safely"
              : "No cycle found",
          );
        } else {
          addLog(`Cycle found: ${cyclePath(outcome.cycle, nextNodes)}`);
          if (outcome.status === "deadlock") {
            addLog("Deadlock detected");
          } else if (metrics.verdict === "inconclusive") {
            addLog(metrics.note ?? "Cycle found; multi-instance deadlock is inconclusive");
          } else {
            addLog("Safe: not a true deadlock");
          }
        }
      };

      if (algorithm === "auto" && outcome.multiInstance && outcome.cycle.length > 0) {
        setChecking(true);
        setResult(null);
        addLog("Cycle found. Checking safety by reduction...");
        timer.current = setTimeout(finish, 900 * factor);
      } else {
        setChecking(false);
        finish();
      }
    },
    [addLog, algorithm, factor],
  );

  const invalidate = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setResult(null);
    setAlgorithmResult(null);
    setComparison(null);
    setChecking(false);
  }, []);

  const nextLabel = useCallback(
    (type: "process" | "resource") => {
      const prefix = type === "process" ? "P" : "R";
      const used = nodes
        .filter((n) => n.type === type)
        .map((n) => Number(n.label.slice(1)))
        .filter((n) => Number.isFinite(n));
      return `${prefix}${(used.length ? Math.max(...used) : 0) + 1}`;
    },
    [nodes],
  );

  const maybeAutoRun = useCallback(
    (n: RagNode[], e: RagEdge[]) => {
      if (stepByStep) runDetection(n, e);
    },
    [runDetection, stepByStep],
  );

  const handleCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (event.target !== svgRef.current) return;
    setSelection(null);
    if (tool !== "process" && tool !== "resource") {
      setPendingSource(null);
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const label = nextLabel(tool);
    const node: RagNode = {
      id: `${tool}-${label}-${(uid.current += 1)}`,
      type: tool,
      label,
      x,
      y,
      instances: 1,
    };
    const next = [...nodes, node];
    setNodes(next);
    addLog(`${label} added`);
    invalidate();
    maybeAutoRun(next, edges);
  };

  const handleNodeClick = (node: RagNode) => {
    if (tool === "process" || tool === "resource") {
      setSelection({ kind: "node", id: node.id });
      return;
    }
    if (!pendingSource) {
      const needed = tool === "request" ? "process" : "resource";
      if (node.type !== needed) {
        addLog(
          tool === "request"
            ? "Request Edge starts at a Process"
            : "Assignment Edge starts at a Resource",
        );
        return;
      }
      setPendingSource(node.id);
      setSelection({ kind: "node", id: node.id });
      addLog(`${node.label} selected as source`);
      return;
    }
    const source = nodeById(pendingSource);
    if (!source) {
      setPendingSource(null);
      return;
    }
    if (source.id === node.id) {
      setPendingSource(null);
      addLog("Source cleared");
      return;
    }
    const target = tool === "request" ? "resource" : "process";
    if (node.type !== target) {
      addLog(
        tool === "request"
          ? "Request Edge ends at a Resource"
          : "Assignment Edge ends at a Process",
      );
      return;
    }
    if (edges.some((e) => e.from === source.id && e.to === node.id)) {
      addLog(`${source.label} \u2192 ${node.label} already exists`);
      setPendingSource(null);
      return;
    }
    const edge: RagEdge = {
      id: `edge-${source.id}-${node.id}-${(uid.current += 1)}`,
      from: source.id,
      to: node.id,
      type: tool,
    };
    const next = [...edges, edge];
    setEdges(next);
    setPendingSource(null);
    setSelection({ kind: "edge", id: edge.id });
    addLog(`${source.label} \u2192 ${node.label} added`);
    invalidate();
    maybeAutoRun(nodes, next);
  };

  const grantRequest = (edge: RagEdge) => {
    const resource = nodeById(edge.to);
    const process = nodeById(edge.from);
    if (!resource || !process) return;
    const allocated = edges.filter((e) => e.type === "assignment" && e.from === resource.id).length;
    if (allocated >= resource.instances) {
      addLog(`${resource.label} has no free instance. Request Edge kept`);
      return;
    }
    const next = edges.map((e) =>
      e.id === edge.id
        ? { ...e, from: resource.id, to: process.id, type: "assignment" as const }
        : e,
    );
    setEdges(next);
    addLog(
      `${process.label} \u2192 ${resource.label} granted. Converted to Assignment Edge ${resource.label} \u2192 ${process.label}`,
    );
    invalidate();
    maybeAutoRun(nodes, next);
  };

  const deleteSelection = () => {
    if (!selection) return;
    if (selection.kind === "edge") {
      const edge = edges.find((e) => e.id === selection.id);
      if (!edge) return;
      const next = edges.filter((e) => e.id !== edge.id);
      setEdges(next);
      setSelection(null);
      addLog(
        `${nodeById(edge.from)?.label ?? "?"} \u2192 ${nodeById(edge.to)?.label ?? "?"} removed`,
      );
      invalidate();
      maybeAutoRun(nodes, next);
      return;
    }
    const node = nodeById(selection.id);
    if (!node) return;
    const nextNodes = nodes.filter((n) => n.id !== node.id);
    const nextEdges = edges.filter((e) => e.from !== node.id && e.to !== node.id);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelection(null);
    addLog(`${node.label} removed`);
    invalidate();
    maybeAutoRun(nextNodes, nextEdges);
  };

  const changeInstances = (node: RagNode, delta: number) => {
    const allocated = edges.filter((e) => e.type === "assignment" && e.from === node.id).length;
    const value = Math.max(Math.max(1, allocated), Math.min(8, node.instances + delta));
    if (value === node.instances) return;
    const next = nodes.map((n) => (n.id === node.id ? { ...n, instances: value } : n));
    setNodes(next);
    addLog(`${node.label} instances set to ${value}`);
    invalidate();
    maybeAutoRun(next, edges);
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNodes([]);
    setEdges([]);
    setSelection(null);
    setPendingSource(null);
    setResult(null);
    setAlgorithmResult(null);
    setComparison(null);
    setChecking(false);
    setLog([]);
    logId.current = 0;
    setConfirmReset(false);
  };

  const exportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Resource Allocation Graph Deadlock Simulator", 40, 46);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Processes: ${counts.processes}   Resources: ${counts.resources}   Edges: ${counts.edges}   Status: ${badge.text}`,
      40,
      64,
    );
    doc.text(
      mode === "single"
        ? `Selected algorithm: ${algorithm.toUpperCase()}`
        : "Mode: Distributed Operating System (DOS)",
      40,
      78,
    );
    let reportY = 94;
    if (comparison) {
      doc.setFont("helvetica", "bold");
      doc.text("Performance Comparison", 40, reportY);
      reportY += 14;
      doc.setFont("helvetica", "normal");
      for (const item of comparison) {
        const dfsCounts =
          item.algorithm === "dfs"
            ? ` (nodes visited ${item.nodesVisited}; edges examined ${item.edgesExamined})`
            : "";
        doc.text(
          `${item.algorithm}: ${item.verdict}, ${item.timeMs.toFixed(4)} ms, checks ${checksFor(item)}${dfsCounts}, passes ${item.passes}, reductions ${item.reductions}, remaining ${item.remainingProcesses.join(", ") || "none"}`,
          40,
          reportY,
        );
        reportY += 12;
      }
    }
    if (mode === "dos" && dosReport) {
      doc.setFont("helvetica", "bold");
      doc.text("Distributed Operating System Results", 40, reportY);
      reportY += 14;
      doc.setFont("helvetica", "normal");
      for (const line of dosReport.split("\n")) {
        if (reportY > 780) {
          doc.addPage();
          reportY = 50;
        }
        doc.text(line.slice(0, 110), 40, reportY);
        reportY += 12;
      }
    }

    const originX = 40;
    const originY = mode === "single" ? Math.max(110, reportY + 8) : reportY + 8;
    const boxW = pageW - 80;
    const boxH = mode === "single" ? 340 : 0;
    doc.setDrawColor(150);
    if (mode === "single") doc.rect(originX, originY, boxW, boxH);

    if (mode === "single" && nodes.length > 0) {
      const minX = Math.min(...nodes.map((n) => n.x)) - 60;
      const maxX = Math.max(...nodes.map((n) => n.x)) + 60;
      const minY = Math.min(...nodes.map((n) => n.y)) - 60;
      const maxY = Math.max(...nodes.map((n) => n.y)) + 60;
      const scale = Math.min(boxW / (maxX - minX), boxH / (maxY - minY), 1);
      const tx = (x: number) => originX + (x - minX) * scale + 10;
      const ty = (y: number) => originY + (y - minY) * scale + 10;

      doc.setDrawColor(70);
      for (const e of edges) {
        const a = nodeById(e.from);
        const b = nodeById(e.to);
        if (!a || !b) continue;
        const p1 = anchorPoint(a, b);
        const p2 = anchorPoint(b, a);
        doc.setLineDashPattern(e.type === "request" ? [3, 2] : [], 0);
        doc.line(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y));
      }
      doc.setLineDashPattern([], 0);

      doc.setFontSize(9);
      for (const n of nodes) {
        if (n.type === "process") {
          doc.circle(tx(n.x), ty(n.y), PROCESS_R * scale);
        } else {
          doc.rect(
            tx(n.x) - (RES_W / 2) * scale,
            ty(n.y) - (RES_H / 2) * scale,
            RES_W * scale,
            RES_H * scale,
          );
        }
        doc.text(n.label, tx(n.x), ty(n.y) + 3, { align: "center" });
      }
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Log", 40, originY + boxH + 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let y = originY + boxH + 46;
    for (const entry of log) {
      if (y > 800) {
        doc.addPage();
        y = 50;
      }
      doc.text(entry.text, 40, y);
      y += 13;
    }
    doc.save("resource-allocation-graph.pdf");
    addLog("Graph exported to PDF");
  };

  const counts = useMemo(
    () => ({
      processes: nodes.filter((n) => n.type === "process").length,
      resources: nodes.filter((n) => n.type === "resource").length,
      edges: edges.length,
    }),
    [nodes, edges],
  );

  const badge: { tone: BadgeTone; text: string; icon: typeof Alert02Icon } =
    algorithmResult?.verdict === "inconclusive"
      ? {
          tone: "checking",
          text: "Cycle found — multi-instance result inconclusive",
          icon: TimeQuarterIcon,
        }
      : checking
        ? {
            tone: "checking",
            text: "Cycle found \u2014 checking safety",
            icon: TimeQuarterIcon,
          }
        : result?.status === "deadlock"
          ? { tone: "danger", text: "Deadlock detected", icon: Alert02Icon }
          : result?.status === "safe"
            ? {
                tone: "safe",
                text: "Safe: not a true deadlock",
                icon: CheckmarkCircle02Icon,
              }
            : result?.status === "no-cycle"
              ? {
                  tone: "neutral",
                  text: "No cycle detected",
                  icon: CheckmarkCircle02Icon,
                }
              : { tone: "neutral", text: "Detection not run", icon: SearchIcon };

  const cycleNodes = new Set(result?.cycleNodeIds ?? []);
  const cycleEdges = new Set(result?.cycleEdgeIds ?? []);
  const graphAnimationDuration = nodes.length <= 30 ? factor : 0;

  const selectedNode = selection?.kind === "node" ? nodeById(selection.id) : undefined;
  const selectedEdge =
    selection?.kind === "edge" ? edges.find((e) => e.id === selection.id) : undefined;

  const toolLabel: Record<Tool, string> = {
    process: "Add Process",
    resource: "Add Resource",
    request: "Request Edge",
    assignment: "Assignment Edge",
  };

  const compareAll = () => {
    if (nodes.length === 0) {
      addLog("Nothing to analyse");
      setComparison(null);
      return;
    }
    const rows = (["dfs", "reduction", "ranked"] as const).map((item) =>
      runAlgorithm(item, nodes, edges),
    );
    setComparison(rows);
    rows.forEach((row) =>
      addLog(
        `${row.algorithm} result: ${row.verdict}; ${row.checks} checks, ${row.passes} passes, ${row.reductions} reductions`,
      ),
    );
    addLog(
      `Algorithms ${new Set(rows.map((row) => row.verdict)).size === 1 ? "agree" : "do not all agree"} on the verdict`,
    );
  };

  const loadRagExample = (key: string) => {
    if (!key) return;
    const graph = RAG_EXAMPLES[key];
    if (!graph) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelection(null);
    setPendingSource(null);
    setResult(null);
    setAlgorithmResult(null);
    setComparison(null);
    setChecking(false);
    setExample("");
    setRandomError("");
    addLog(`Loaded example: ${key}`);
  };

  const generateRandom = () => {
    const processes = Number(processInput);
    const resources = Number(resourceInput);
    if (!Number.isInteger(processes) || processes < 1 || processes > 200) {
      setRandomError("Processes must be a whole number from 1 to 200.");
      return;
    }
    if (!Number.isInteger(resources) || resources < 1 || resources > 100) {
      setRandomError("Resources must be a whole number from 1 to 100.");
      return;
    }
    const graph = createRandomGraph(processes, resources);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelection(null);
    setPendingSource(null);
    setResult(null);
    setAlgorithmResult(null);
    setComparison(null);
    setChecking(false);
    setRandomError("");
    addLog(`Generated random graph: ${processes} processes, ${resources} resources`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
        <h1 className="text-base font-semibold tracking-tight">
          Resource Allocation Graph Deadlock Simulator
        </h1>
        <div className="flex rounded-md border border-border p-0.5" aria-label="Simulator mode">
          {(["single", "dos"] as const).map((value) => (
            <ToolButton
              key={value}
              active={mode === value}
              className="border-0 px-3 py-1.5"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                timer.current = null;
                setChecking(false);
                setMode(value);
                setPendingSource(null);
              }}
            >
              {value === "single" ? "Single System" : "Distributed (DOS)"}
            </ToolButton>
          ))}
        </div>
      </header>

      {mode === "single" ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2.5">
          <ToolButton
            icon={AddCircleIcon}
            active={tool === "process"}
            onClick={() => {
              setTool("process");
              setPendingSource(null);
            }}
          >
            Add Process
          </ToolButton>
          <ToolButton
            icon={AddSquareIcon}
            active={tool === "resource"}
            onClick={() => {
              setTool("resource");
              setPendingSource(null);
            }}
          >
            Add Resource
          </ToolButton>
          <ToolButton
            icon={ArrowRight02Icon}
            active={tool === "request"}
            onClick={() => {
              setTool("request");
              setPendingSource(null);
            }}
          >
            Request Edge
          </ToolButton>
          <ToolButton
            icon={ArrowRight01Icon}
            active={tool === "assignment"}
            onClick={() => {
              setTool("assignment");
              setPendingSource(null);
            }}
          >
            Assignment Edge
          </ToolButton>
          <div className="mx-1 h-6 w-px bg-border" />
          <ToolButton icon={PlayIcon} tone="strong" onClick={() => runDetection(nodes, edges)}>
            Run Detection
          </ToolButton>
          <ToolButton
            icon={RefreshIcon}
            tone="strong"
            active={confirmReset}
            onClick={reset}
            onBlur={() => setConfirmReset(false)}
          >
            {confirmReset ? "Confirm Reset" : "Reset"}
          </ToolButton>
          <label className="text-xs text-muted-foreground">
            Load Example{" "}
            <select
              className="rounded border border-border bg-surface px-2 py-1.5 text-foreground"
              value={example}
              onChange={(event) => loadRagExample(event.target.value)}
            >
              <option value="">Choose…</option>
              <option value="classic">Classic 3-process deadlock</option>
              <option value="safeMulti">Safe multi-instance</option>
              <option value="multiDeadlock">Multi-instance deadlock</option>
              <option value="noCycle">No-cycle graph</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-1">
            <label className="text-xs text-muted-foreground">
              Processes{" "}
              <input
                className="w-16 rounded border border-border bg-surface px-2 py-1.5 text-foreground"
                type="number"
                min="1"
                max="200"
                value={processInput}
                onChange={(event) => setProcessInput(event.target.value)}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Resources{" "}
              <input
                className="w-16 rounded border border-border bg-surface px-2 py-1.5 text-foreground"
                type="number"
                min="1"
                max="100"
                value={resourceInput}
                onChange={(event) => setResourceInput(event.target.value)}
              />
            </label>
            <ToolButton onClick={generateRandom}>Random Graph</ToolButton>
            {randomError ? (
              <span role="alert" className="text-xs text-red-700">
                {randomError}
              </span>
            ) : null}
          </div>
          <ToolButton onClick={compareAll}>Compare All</ToolButton>
        </div>
      ) : null}

      <div className={mode === "dos" ? "flex min-h-0 flex-1" : "hidden"}>
        <DosSimulator
          active={mode === "dos"}
          stepByStep={stepByStep}
          speed={speed}
          log={log.map((entry) => entry.text)}
          addLog={addLog}
          onReportChange={setDosReport}
        />
      </div>
      {mode === "single" ? (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="min-h-[420px] min-w-0 flex-1 p-4">
            <div className="h-full overflow-auto rounded-lg border border-border bg-canvas">
              <svg
                ref={svgRef}
                className="min-h-full min-w-full"
                style={
                  nodes.length > 30
                    ? {
                        width: `${Math.max(1000, 110 + Math.ceil(Math.sqrt(nodes.length)) * 90)}px`,
                        height: `${Math.max(650, 110 + Math.ceil(nodes.length / Math.ceil(Math.sqrt(nodes.length))) * 82)}px`,
                      }
                    : { width: "100%", height: "100%" }
                }
                onClick={handleCanvasClick}
              >
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path
                      d="M 24 0 L 0 0 0 24"
                      fill="none"
                      stroke="var(--canvas-grid)"
                      strokeWidth="1"
                    />
                  </pattern>
                  <marker
                    id="arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-line)" />
                  </marker>
                  <marker
                    id="arrow-cycle"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-cycle)" />
                  </marker>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />

                {edges.map((edge) => {
                  const a = nodeById(edge.from);
                  const b = nodeById(edge.to);
                  if (!a || !b) return null;
                  const p1 = anchorPoint(a, b);
                  const p2 = anchorPoint(b, a);
                  const onCycle = cycleEdges.has(edge.id);
                  const isSelected = selectedEdge?.id === edge.id;
                  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                  return (
                    <g
                      key={edge.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelection({ kind: "edge", id: edge.id });
                      }}
                      className="cursor-pointer"
                    >
                      <path
                        d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
                        stroke="transparent"
                        strokeWidth={16}
                        fill="none"
                        pointerEvents="stroke"
                      />
                      <GrowLine
                        d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
                        duration={0.35 * graphAnimationDuration}
                        strokeWidth={onCycle ? 4 : isSelected ? 3 : 1.8}
                        strokeDasharray={edge.type === "request" ? "9 6" : undefined}
                        markerEnd={`url(#${onCycle ? "arrow-cycle" : "arrow"})`}
                        className={onCycle ? "stroke-edge-cycle" : "stroke-edge-line"}
                      />
                      <g transform={`translate(${mid.x - 9}, ${mid.y - 20})`}>
                        <rect
                          width="18"
                          height="16"
                          rx="3"
                          className="fill-surface stroke-border"
                          strokeWidth="1"
                        />
                        <g transform="translate(2, 0)">
                          <HugeiconsIcon
                            icon={edge.type === "request" ? ArrowRight02Icon : ArrowRight01Icon}
                            size={14}
                            strokeWidth={2}
                            color="var(--node-ink)"
                          />
                        </g>
                      </g>
                    </g>
                  );
                })}

                {nodes.map((node) => {
                  const onCycle = cycleNodes.has(node.id);
                  const isSelected = selectedNode?.id === node.id;
                  const isSource = pendingSource === node.id;
                  const fill = onCycle
                    ? "var(--cycle-fill)"
                    : isSelected || isSource
                      ? "var(--node-selected)"
                      : node.type === "process"
                        ? "var(--node-process)"
                        : "var(--node-resource)";
                  const allocated = edges.filter(
                    (e) => e.type === "assignment" && e.from === node.id,
                  ).length;
                  return (
                    <FadeScaleIn key={node.id} duration={0.25 * graphAnimationDuration}>
                      <PulseOnce
                        active={onCycle}
                        pulseKey={`${node.id}-${pulseKey}`}
                        duration={0.5 * graphAnimationDuration}
                      >
                        <g
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNodeClick(node);
                          }}
                          className="cursor-pointer"
                        >
                          {node.type === "process" ? (
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={PROCESS_R}
                              fill={fill}
                              stroke="var(--border)"
                              strokeWidth={onCycle ? 3 : 1.5}
                            />
                          ) : (
                            <rect
                              x={node.x - RES_W / 2}
                              y={node.y - RES_H / 2}
                              width={RES_W}
                              height={RES_H}
                              rx="4"
                              fill={fill}
                              stroke="var(--border)"
                              strokeWidth={onCycle ? 3 : 1.5}
                            />
                          )}
                          <text
                            x={node.x}
                            y={node.type === "process" ? node.y + 5 : node.y - 2}
                            textAnchor="middle"
                            className="font-mono text-[13px] font-medium select-none"
                            fill="var(--node-ink)"
                          >
                            {node.label}
                          </text>
                          {node.type === "resource"
                            ? Array.from({ length: node.instances }).map((_, i) => (
                                <circle
                                  key={i}
                                  cx={node.x - ((node.instances - 1) * 10) / 2 + i * 10}
                                  cy={node.y + 13}
                                  r={3.2}
                                  fill={
                                    i < allocated ? "var(--muted-foreground)" : "var(--surface)"
                                  }
                                  stroke="var(--node-ink)"
                                  strokeWidth="1"
                                />
                              ))
                            : null}
                        </g>
                      </PulseOnce>
                    </FadeScaleIn>
                  );
                })}
              </svg>
            </div>
          </main>

          <aside className="flex max-h-[70vh] w-full min-w-0 flex-col border-t border-border bg-surface-strong lg:max-h-none lg:w-[25%] lg:min-w-[300px] lg:border-l lg:border-t-0">
            <Panel className="m-4 mb-0 overflow-hidden">
              <PanelSection title="Status">
                <StatusBadge tone={badge.tone} icon={badge.icon}>
                  {badge.text}
                </StatusBadge>
                <p className="mt-2 text-xs text-muted-foreground">
                  {algorithmResult?.verdict === "inconclusive"
                    ? algorithmResult.note
                    : result?.status === "deadlock"
                      ? "Deadlock detected. Remove one edge in the cycle to resolve it."
                      : result?.status === "safe"
                        ? "The graph reduces completely. No process is permanently blocked."
                        : checking
                          ? "Reducing the graph to test whether the cycle is a true deadlock."
                          : result?.status === "no-cycle"
                            ? "No cycle exists in the current graph."
                            : "Run Detection to check the current graph."}
                </p>
                {algorithmResult ? (
                  <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
                    <p>
                      {algorithmResult.algorithm.toUpperCase()} ·{" "}
                      {algorithmResult.timeMs.toFixed(4)} ms (200-run average)
                    </p>
                    {algorithmResult.algorithm === "dfs" ? (
                      <p>
                        Nodes visited: {algorithmResult.nodesVisited} · Edges examined:{" "}
                        {algorithmResult.edgesExamined}
                      </p>
                    ) : algorithmResult.algorithm !== "auto" || algorithmResult.checks > 0 ? (
                      <p>
                        Checks: {algorithmResult.checks} · Passes: {algorithmResult.passes} ·
                        Reductions: {algorithmResult.reductions}
                      </p>
                    ) : null}
                    {algorithmResult.remainingProcesses.length > 0 ? (
                      <p>Remaining: {algorithmResult.remainingProcesses.join(", ")}</p>
                    ) : null}
                  </div>
                ) : null}
              </PanelSection>

              <PanelSection title="Active tool">
                <div className="font-mono text-sm">{toolLabel[tool]}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {tool === "process" || tool === "resource"
                    ? "Click the canvas to place a node."
                    : pendingSource
                      ? `Source ${nodeById(pendingSource)?.label ?? ""} selected. Click the target node.`
                      : "Click the source node, then the target node."}
                </div>
              </PanelSection>

              <PanelSection title="Counts">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Processes" value={String(counts.processes)} />
                  <Stat label="Resources" value={String(counts.resources)} />
                  <Stat label="Edges" value={String(counts.edges)} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Mode: {isMultiInstance(nodes) ? "Multi-instance" : "Single-instance"}
                </div>
              </PanelSection>

              <PanelSection title="Selection" className="border-b-0">
                {selectedNode ? (
                  <div className="space-y-2">
                    <div className="font-mono text-sm">
                      {selectedNode.label} (
                      {selectedNode.type === "process" ? "Process" : "Resource"})
                    </div>
                    {selectedNode.type === "resource" ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Instances</span>
                        <ToolButton
                          icon={MinusSignIcon}
                          className="px-2 py-1"
                          onClick={() => changeInstances(selectedNode, -1)}
                          aria-label="Decrease instances"
                        />
                        <span className="font-mono text-sm">{selectedNode.instances}</span>
                        <ToolButton
                          icon={PlusSignIcon}
                          className="px-2 py-1"
                          onClick={() => changeInstances(selectedNode, 1)}
                          aria-label="Increase instances"
                        />
                      </div>
                    ) : null}
                    <ToolButton icon={Delete02Icon} onClick={deleteSelection}>
                      Delete Node
                    </ToolButton>
                  </div>
                ) : selectedEdge ? (
                  <div className="space-y-2">
                    <div className="font-mono text-sm">
                      {nodeById(selectedEdge.from)?.label} {"\u2192"}{" "}
                      {nodeById(selectedEdge.to)?.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedEdge.type === "request" ? "Request Edge" : "Assignment Edge"}
                    </div>
                    {selectedEdge.type === "request" ? (
                      <ToolButton
                        icon={CheckmarkCircle02Icon}
                        onClick={() => grantRequest(selectedEdge)}
                      >
                        Grant Request
                      </ToolButton>
                    ) : null}
                    <ToolButton icon={Delete02Icon} onClick={deleteSelection}>
                      Delete Edge
                    </ToolButton>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Select a node or an edge on the canvas to edit it.
                  </p>
                )}
              </PanelSection>
              {comparison ? (
                <PanelSection title="Performance Comparison">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Algorithms{" "}
                    {new Set(comparison.map((row) => row.verdict)).size === 1
                      ? "agree"
                      : "do not all agree"}{" "}
                    on the verdict.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="p-1">Algorithm</th>
                          <th className="p-1">Verdict</th>
                          <th className="p-1">Time (ms)</th>
                          <th className="p-1">Checks</th>
                          <th className="p-1">Passes</th>
                          <th className="p-1">Reductions</th>
                          <th className="p-1">Remaining processes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.map((row) => {
                          const fastest =
                            row.timeMs === Math.min(...comparison.map((item) => item.timeMs));
                          const fewest = checksFor(row) === Math.min(...comparison.map(checksFor));
                          const verdict = row.verdict === "no-cycle" ? "No cycle" : row.verdict;
                          const label =
                            row.algorithm === "dfs"
                              ? "DFS"
                              : row.algorithm.charAt(0).toUpperCase() + row.algorithm.slice(1);
                          return (
                            <tr key={row.algorithm} className="border-b border-border">
                              <td className="p-1">{label}</td>
                              <td className="p-1">{verdict}</td>
                              <td className={`p-1 ${fastest ? "bg-state-safe font-semibold" : ""}`}>
                                {row.timeMs.toFixed(4)}
                              </td>
                              <td className={`p-1 ${fewest ? "bg-state-safe font-semibold" : ""}`}>
                                {checksFor(row)}
                                {row.algorithm === "dfs" ? (
                                  <span className="font-normal">
                                    {" "}
                                    ({row.nodesVisited} nodes / {row.edgesExamined} edges)
                                  </span>
                                ) : null}
                              </td>
                              <td className="p-1">{row.passes}</td>
                              <td className="p-1">{row.reductions}</td>
                              <td className="p-1">{row.remainingProcesses.join(", ") || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </PanelSection>
              ) : null}
            </Panel>

            <Panel className="m-4 flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Log
                </h2>
              </div>
              <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {log.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No activity yet. Add a node to start.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {log.map((entry, index) => (
                      <li key={`${entry.id}-${index}`}>
                        <FadeIn duration={0.2 * factor}>
                          <span className="font-mono text-xs text-foreground">{entry.text}</span>
                        </FadeIn>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </aside>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-surface px-5 py-2.5">
        {mode === "single" ? (
          <div
            className="flex items-center rounded-md border border-border p-0.5"
            aria-label="Algorithm"
          >
            {(["auto", "dfs", "reduction", "ranked"] as Algorithm[]).map((value) => (
              <ToolButton
                key={value}
                active={algorithm === value}
                className="border-0 px-2.5 py-1.5 text-xs capitalize"
                onClick={() => {
                  if (timer.current) {
                    clearTimeout(timer.current);
                    timer.current = null;
                  }
                  setAlgorithm(value);
                  setComparison(null);
                  setResult(null);
                  setAlgorithmResult(null);
                  setChecking(false);
                }}
              >
                {value === "auto"
                  ? "Auto"
                  : value === "dfs"
                    ? "DFS"
                    : value === "reduction"
                      ? "Reduction"
                      : "Ranked"}
              </ToolButton>
            ))}
          </div>
        ) : null}
        <ToolButton active={stepByStep} onClick={() => setStepByStep((s) => !s)}>
          Step-by-step: {stepByStep ? "On" : "Off"}
        </ToolButton>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Speed</span>
          <div className="flex gap-1">
            {(["slow", "normal", "fast"] as Speed[]).map((s) => (
              <ToolButton
                key={s}
                active={speed === s}
                className="px-2.5 py-1 text-xs capitalize"
                onClick={() => setSpeed(s)}
              >
                {s}
              </ToolButton>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <ToolButton icon={Download01Icon} tone="strong" onClick={exportPdf}>
            Export PDF
          </ToolButton>
        </div>
      </footer>
    </div>
  );
}
