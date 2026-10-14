import { describe, expect, it } from "vitest";
import { detect, runAlgorithm } from "@/lib/rag-engine";
import { RAG_EXAMPLES } from "@/lib/rag-examples";

describe("resource allocation graph algorithms", () => {
  it("detects the classic single-instance ring as a deadlock", () => {
    const graph = RAG_EXAMPLES["classic"]!;
    expect(detect(graph.nodes, graph.edges).status).toBe("deadlock");
    for (const algorithm of ["dfs", "reduction", "ranked"] as const) {
      expect(runAlgorithm(algorithm, graph.nodes, graph.edges).verdict).toBe("deadlock");
    }
  });

  it("classifies the safe multi-instance cycle without calling the DFS cycle a deadlock", () => {
    const graph = RAG_EXAMPLES["safeMulti"]!;
    expect(detect(graph.nodes, graph.edges).status).toBe("safe");
    expect(runAlgorithm("dfs", graph.nodes, graph.edges).verdict).toBe("inconclusive");
    expect(runAlgorithm("reduction", graph.nodes, graph.edges).verdict).toBe("safe");
    expect(runAlgorithm("ranked", graph.nodes, graph.edges).verdict).toBe("safe");
  });

  it("classifies the no-cycle example across DFS and both reduction variants", () => {
    const graph = RAG_EXAMPLES["noCycle"]!;
    expect(runAlgorithm("dfs", graph.nodes, graph.edges).verdict).toBe("no-cycle");
    expect(runAlgorithm("reduction", graph.nodes, graph.edges).verdict).toBe("safe");
    expect(runAlgorithm("ranked", graph.nodes, graph.edges).verdict).toBe("safe");
  });

  it("detects the multi-instance deadlock", () => {
    const graph = RAG_EXAMPLES["multiDeadlock"]!;
    expect(detect(graph.nodes, graph.edges).status).toBe("deadlock");
    expect(runAlgorithm("dfs", graph.nodes, graph.edges).verdict).toBe("inconclusive");
    expect(runAlgorithm("reduction", graph.nodes, graph.edges).verdict).toBe("deadlock");
    expect(runAlgorithm("ranked", graph.nodes, graph.edges).verdict).toBe("deadlock");
  });

  it("keeps traditional and ranked reductions in agreement for every supplied example", () => {
    for (const graph of Object.values(RAG_EXAMPLES)) {
      expect(runAlgorithm("reduction", graph.nodes, graph.edges).verdict).toBe(
        runAlgorithm("ranked", graph.nodes, graph.edges).verdict,
      );
    }
  });

  it("handles an empty graph, isolated nodes, and requests beyond available instances", () => {
    expect(runAlgorithm("auto", [], []).verdict).toBe("no-cycle");
    expect(runAlgorithm("dfs", RAG_EXAMPLES["noCycle"]!.nodes, []).verdict).toBe("no-cycle");
    const overloaded = {
      nodes: [
        { id: "p1", type: "process" as const, label: "P1", x: 0, y: 0, instances: 1 },
        { id: "r1", type: "resource" as const, label: "R1", x: 1, y: 0, instances: 1 },
      ],
      edges: [
        { id: "e1", from: "p1", to: "r1", type: "request" as const },
        { id: "e2", from: "p1", to: "r1", type: "request" as const },
      ],
    };
    expect(runAlgorithm("reduction", overloaded.nodes, overloaded.edges)).toMatchObject({
      verdict: "deadlock",
      remainingProcesses: ["P1"],
    });
  });

  it("reports DFS traversal and reduction metrics with a 200-run average", () => {
    const graph = RAG_EXAMPLES["classic"]!;
    const dfs = runAlgorithm("dfs", graph.nodes, graph.edges);
    expect(dfs.nodesVisited).toBeGreaterThan(0);
    expect(dfs.edgesExamined).toBeGreaterThan(0);
    const reduction = runAlgorithm("reduction", graph.nodes, graph.edges);
    expect(reduction.checks).toBeGreaterThan(0);
    expect(reduction.passes).toBeGreaterThan(0);
    expect(reduction.reductions).toBe(0);
    expect(reduction.remainingProcesses).toEqual(["P1", "P2", "P3"]);
    expect(Number.isFinite(reduction.timeMs)).toBe(true);
  });
});
