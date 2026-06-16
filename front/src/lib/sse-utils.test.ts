import { describe, expect, it } from "vitest";

import {
  maskPhone,
  mergeAlerts,
  mergeStatuses,
  sortAlertsBySeq,
  type ResidentStatus,
  type SseAlert,
  type SseStatusEvent,
} from "./sse-utils";

function alert(seq: string, over: Partial<SseAlert> = {}): SseAlert {
  return {
    alertSeq: seq,
    id: `a${seq}`,
    orgId: "org-1",
    residentId: "r1",
    cameraId: null,
    type: "fall",
    probability: 0.9,
    detectedAt: "2026-06-16T00:00:00.000Z",
    status: "NEW",
    ...over,
  };
}

describe("sortAlertsBySeq", () => {
  it("orders by alertSeq descending using BigInt (not lexicographic) compare", () => {
    const sorted = sortAlertsBySeq([alert("9"), alert("100"), alert("10")]);
    expect(sorted.map((a) => a.alertSeq)).toEqual(["100", "10", "9"]);
  });

  it("does not mutate the input array", () => {
    const input = [alert("1"), alert("2")];
    sortAlertsBySeq(input);
    expect(input.map((a) => a.alertSeq)).toEqual(["1", "2"]);
  });
});

describe("mergeAlerts", () => {
  it("dedupes by alertSeq (incoming wins) and sorts descending", () => {
    const existing = [alert("1", { status: "NEW" }), alert("2")];
    const incoming = [alert("1", { status: "ACKED" }), alert("3")];
    const merged = mergeAlerts(existing, incoming);
    expect(merged.map((a) => a.alertSeq)).toEqual(["3", "2", "1"]);
    expect(merged.find((a) => a.alertSeq === "1")?.status).toBe("ACKED");
  });
});

describe("mergeStatuses", () => {
  const base: ResidentStatus = {
    id: "r1",
    residentId: "r1",
    orgId: "org-1",
    state: "NORMAL",
    lastSeenAt: null,
    cameraOnline: false,
    source: "cam-1",
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
  const evt = (over: Partial<SseStatusEvent> = {}): SseStatusEvent => ({
    alertSeq: "5",
    orgId: "org-1",
    residentId: "r1",
    state: "FALL",
    cameraOnline: true,
    lastSeenAt: "2026-06-16T01:00:00.000Z",
    ...over,
  });

  it("updates an existing resident in place, preserving untouched fields", () => {
    const out = mergeStatuses([base], evt());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      state: "FALL",
      cameraOnline: true,
      lastSeenAt: "2026-06-16T01:00:00.000Z",
      source: "cam-1",
    });
  });

  it("appends a minimal entry when the resident is not present", () => {
    const out = mergeStatuses([base], evt({ residentId: "r2" }));
    expect(out).toHaveLength(2);
    const added = out.find((s) => s.residentId === "r2");
    expect(added?.state).toBe("FALL");
    expect(added?.source).toBeNull();
  });
});

describe("maskPhone", () => {
  it("masks the middle of an 11-digit number", () => {
    expect(maskPhone("01012345678")).toBe("010-****-5678");
  });

  it("strips non-digits before masking", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
  });

  it("returns a fully-masked placeholder for too-short input", () => {
    expect(maskPhone("123")).toBe("***-****-****");
  });
});
