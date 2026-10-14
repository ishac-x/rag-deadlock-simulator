import { describe, expect, it } from "vitest";
import { compareDosMethods, type DosProcess, type WaitForEdge } from "@/lib/dos-engine";

describe("distributed deadlock detection", () => {
  it("finds a 3-site ring missed by all local checks", () => {
    const processes: DosProcess[] = [
      { id: "p1", label: "P1", site: 0 },
      { id: "p2", label: "P2", site: 1 },
      { id: "p3", label: "P3", site: 2 },
    ];
    const edges: WaitForEdge[] = [
      { id: "e1", from: "p1", to: "p2" },
      { id: "e2", from: "p2", to: "p3" },
      { id: "e3", from: "p3", to: "p1" },
    ];
    const result = compareDosMethods(processes, edges, 3);
    expect(result.local.localChecks.map((check) => check.verdict)).toEqual([
      "no-cycle",
      "no-cycle",
      "no-cycle",
    ]);
    expect(result.centralised.verdict).toBe("deadlock");
    expect(result.centralised.messages).toBe(3);
    expect(result.edgeChasing.verdict).toBe("deadlock");
    expect(result.edgeChasing.totalProbes).toBeGreaterThan(0);
    expect(result.edgeChasing.interSiteProbes).toBeGreaterThan(0);
    expect(result.edgeChasing.probeLog).toContain("probe (P1, P3, P1)");
  });

  it("does not report a chain as a deadlock", () => {
    const result = compareDosMethods(
      [
        { id: "p1", label: "P1", site: 0 },
        { id: "p2", label: "P2", site: 1 },
        { id: "p3", label: "P3", site: 2 },
      ],
      [
        { id: "e1", from: "p1", to: "p2" },
        { id: "e2", from: "p2", to: "p3" },
      ],
      3,
    );
    expect(result.centralised.verdict).toBe("no-cycle");
    expect(result.edgeChasing.verdict).toBe("no-cycle");
  });
});
