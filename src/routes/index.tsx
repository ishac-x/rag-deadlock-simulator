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
import {
  FadeIn,
  FadeScaleIn,
  GrowLine,
  PulseOnce,
} from "@/components/animate-ui/primitives";
import {
  cyclePath,
  detect,
  isMultiInstance,
  type DetectionResult,
  type RagEdge,
  type RagNode,
} from "@/lib/rag-engine";

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

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const nodeById = useCallback(
    (id: string) => nodes.find((n) => n.id === id),
    [nodes],
  );

  const runDetection = useCallback(
    (nextNodes: RagNode[], nextEdges: RagEdge[]) => {
      if (timer.current) clearTimeout(timer.current);
      addLog("Checking cycles...");
      const outcome = detect(nextNodes, nextEdges);

      const finish = () => {
        setChecking(false);
        setResult(outcome);
        setPulseKey((k) => k + 1);
        if (outcome.status === "no-cycle") {
          addLog("No cycle found");
        } else {
          addLog(`Cycle found: ${cyclePath(outcome.cycle, nextNodes)}`);
          if (outcome.status === "deadlock") {
            addLog("Deadlock detected");
          } else {
            addLog("Safe: not a true deadlock");
          }
        }
      };

      if (outcome.multiInstance && outcome.cycle.length > 0) {
        setChecking(true);
        setResult(null);
        addLog("Cycle found. Checking safety by reduction...");
        timer.current = setTimeout(finish, 900 * factor);
      } else {
        setChecking(false);
        finish();
      }
    },
    [addLog, factor],
  );

  const invalidate = useCallback(() => {
    setResult(null);
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
    const allocated = edges.filter(
      (e) => e.type === "assignment" && e.from === resource.id,
    ).length;
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
    const nextEdges = edges.filter(
      (e) => e.from !== node.id && e.to !== node.id,
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelection(null);
    addLog(`${node.label} removed`);
    invalidate();
    maybeAutoRun(nextNodes, nextEdges);
  };

  const changeInstances = (node: RagNode, delta: number) => {
    const allocated = edges.filter(
      (e) => e.type === "assignment" && e.from === node.id,
    ).length;
    const value = Math.max(Math.max(1, allocated), Math.min(8, node.instances + delta));
    if (value === node.instances) return;
    const next = nodes.map((n) =>
      n.id === node.id ? { ...n, instances: value } : n,
    );
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
    setNodes([]);
    setEdges([]);
    setSelection(null);
    setPendingSource(null);
    setResult(null);
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

    const originX = 40;
    const originY = 86;
    const boxW = pageW - 80;
    const boxH = 340;
    doc.setDrawColor(150);
    doc.rect(originX, originY, boxW, boxH);

    if (nodes.length > 0) {
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
    checking
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

  const selectedNode =
    selection?.kind === "node" ? nodeById(selection.id) : undefined;
  const selectedEdge =
    selection?.kind === "edge"
      ? edges.find((e) => e.id === selection.id)
      : undefined;

  const toolLabel: Record<Tool, string> = {
    process: "Add Process",
    resource: "Add Resource",
    request: "Request Edge",
    assignment: "Assignment Edge",
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface px-5 py-3">
        <h1 className="text-base font-semibold tracking-tight">
          Resource Allocation Graph Deadlock Simulator
        </h1>
      </header>

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
        <ToolButton
          icon={PlayIcon}
          tone="strong"
          onClick={() => runDetection(nodes, edges)}
        >
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
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 p-4">
          <div className="h-full overflow-hidden rounded-lg border border-border bg-canvas">
            <svg
              ref={svgRef}
              className="h-full w-full"
              onClick={handleCanvasClick}
            >
              <defs>
                <pattern
                  id="grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
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
              <rect
                width="100%"
                height="100%"
                fill="url(#grid)"
                pointerEvents="none"
              />

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
                      duration={0.35 * factor}
                      strokeWidth={onCycle ? 4 : isSelected ? 3 : 1.8}
                      strokeDasharray={
                        edge.type === "request" ? "9 6" : undefined
                      }
                      markerEnd={`url(#${onCycle ? "arrow-cycle" : "arrow"})`}
                      className={
                        onCycle ? "stroke-edge-cycle" : "stroke-edge-line"
                      }
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
                          icon={
                            edge.type === "request"
                              ? ArrowRight02Icon
                              : ArrowRight01Icon
                          }
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
                  <FadeScaleIn key={node.id} duration={0.25 * factor}>
                    <PulseOnce active={onCycle} pulseKey={`${node.id}-${pulseKey}`} duration={0.5 * factor}>
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
                          ? Array.from({ length: node.instances }).map(
                              (_, i) => (
                                <circle
                                  key={i}
                                  cx={
                                    node.x -
                                    ((node.instances - 1) * 10) / 2 +
                                    i * 10
                                  }
                                  cy={node.y + 13}
                                  r={3.2}
                                  fill={
                                    i < allocated
                                      ? "var(--muted-foreground)"
                                      : "var(--surface)"
                                  }
                                  stroke="var(--node-ink)"
                                  strokeWidth="1"
                                />
                              ),
                            )
                          : null}
                      </g>
                    </PulseOnce>
                  </FadeScaleIn>
                );
              })}
            </svg>
          </div>
        </main>

        <aside className="flex w-[25%] min-w-[300px] flex-col border-l border-border bg-surface-strong">
          <Panel className="m-4 mb-0 overflow-hidden">
            <PanelSection title="Status">
              <StatusBadge tone={badge.tone} icon={badge.icon}>
                {badge.text}
              </StatusBadge>
              <p className="mt-2 text-xs text-muted-foreground">
                {result?.status === "deadlock"
                  ? "Deadlock detected. Remove one edge in the cycle to resolve it."
                  : result?.status === "safe"
                    ? "The graph reduces completely. No process is permanently blocked."
                    : checking
                      ? "Reducing the graph to test whether the cycle is a true deadlock."
                      : result?.status === "no-cycle"
                        ? "No cycle exists in the current graph."
                        : "Run Detection to check the current graph."}
              </p>
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
                      <span className="text-xs text-muted-foreground">
                        Instances
                      </span>
                      <ToolButton
                        icon={MinusSignIcon}
                        className="px-2 py-1"
                        onClick={() => changeInstances(selectedNode, -1)}
                        aria-label="Decrease instances"
                      />
                      <span className="font-mono text-sm">
                        {selectedNode.instances}
                      </span>
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
                    {selectedEdge.type === "request"
                      ? "Request Edge"
                      : "Assignment Edge"}
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
                        <span className="font-mono text-xs text-foreground">
                          {entry.text}
                        </span>
                      </FadeIn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-surface px-5 py-2.5">
        <ToolButton
          active={stepByStep}
          onClick={() => setStepByStep((s) => !s)}
        >
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
