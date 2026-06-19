import { describe, expect, it } from "vitest";
import { hourlyTrend, typeBreakdown } from "./dashboard-metrics";
import type { SseAlert } from "./sse-utils";

function alert(type: string, detectedAt: string): SseAlert {
  return {
    alertSeq: "1",
    id: "a",
    orgId: "o",
    residentId: "r",
    cameraId: null,
    type,
    probability: 0.9,
    detectedAt,
    status: "NEW",
  };
}

describe("hourlyTrend", () => {
  it("buckets by KST hour and counts FALL separately", () => {
    // 00:30 UTC == 09:30 KST -> hour 9
    const trend = hourlyTrend([
      alert("FALL", "2026-06-18T00:30:00Z"),
      alert("BED_EXIT", "2026-06-18T00:45:00Z"),
    ]);
    expect(trend).toHaveLength(24);
    expect(trend[9]).toEqual({ hour: 9, total: 2, fall: 1 });
    expect(trend[0].total).toBe(0);
  });
});

describe("typeBreakdown", () => {
  it("groups by real type value, labels, and sorts desc", () => {
    const slices = typeBreakdown(
      [alert("FALL", "2026-06-18T00:00:00Z"), alert("FALL", "2026-06-18T01:00:00Z"), alert("NO_MOTION", "2026-06-18T02:00:00Z")],
      (t) => (t === "FALL" ? "낙상" : t),
    );
    expect(slices[0]).toEqual({ type: "FALL", label: "낙상", count: 2 });
    expect(slices[1].count).toBe(1);
  });
});
