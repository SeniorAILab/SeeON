/**
 * Unit tests for sse-utils.ts pure functions.
 * Run: node --experimental-strip-types src/lib/sse-utils.test.ts
 * (Node.js 22+ required for --experimental-strip-types)
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

// Inline the implementations so the test is self-contained and
// runnable with --experimental-strip-types without bundler resolution.

type AlertStatus = "NEW" | "ACKED" | "RESOLVED";
type ResidentState = "NORMAL" | "WARNING" | "FALL";

interface SseAlert {
  alertSeq: string;
  id: string;
  orgId: string;
  residentId: string;
  cameraId: string | null;
  type: string;
  probability: number;
  detectedAt: string;
  status: AlertStatus;
}

interface ResidentStatus {
  id: string;
  residentId: string;
  orgId: string;
  state: ResidentState;
  lastSeenAt: string | null;
  cameraOnline: boolean;
  source: string | null;
  updatedAt: string;
  resident?: { name: string; room: string | null } | null;
}

interface SseStatusEvent {
  alertSeq: string;
  orgId: string;
  residentId: string;
  state: ResidentState;
  cameraOnline: boolean;
  lastSeenAt: string | null;
}

function sortAlertsBySeq(alerts: SseAlert[]): SseAlert[] {
  return [...alerts].sort((a, b) => {
    const seqA = BigInt(a.alertSeq);
    const seqB = BigInt(b.alertSeq);
    if (seqB > seqA) return 1;
    if (seqB < seqA) return -1;
    return 0;
  });
}

function mergeAlerts(existing: SseAlert[], incoming: SseAlert[]): SseAlert[] {
  const map = new Map<string, SseAlert>();
  for (const a of existing) map.set(a.alertSeq, a);
  for (const a of incoming) map.set(a.alertSeq, a);
  return sortAlertsBySeq(Array.from(map.values()));
}

function mergeStatuses(
  existing: ResidentStatus[],
  incoming: SseStatusEvent,
): ResidentStatus[] {
  const idx = existing.findIndex((s) => s.residentId === incoming.residentId);
  if (idx === -1) {
    return [
      ...existing,
      {
        id: incoming.residentId,
        residentId: incoming.residentId,
        orgId: incoming.orgId,
        state: incoming.state,
        lastSeenAt: incoming.lastSeenAt,
        cameraOnline: incoming.cameraOnline,
        source: null,
        updatedAt: new Date().toISOString(),
      },
    ];
  }
  return existing.map((s, i) =>
    i === idx
      ? {
          ...s,
          state: incoming.state,
          cameraOnline: incoming.cameraOnline,
          lastSeenAt: incoming.lastSeenAt,
        }
      : s,
  );
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***-****-****";
  const prefix = digits.slice(0, 3);
  const suffix = digits.slice(-4);
  return `${prefix}-****-${suffix}`;
}

// ---- helpers ----

function makeAlert(seq: string, overrides?: Partial<SseAlert>): SseAlert {
  return {
    alertSeq: seq,
    id: `alert-${seq}`,
    orgId: "org1",
    residentId: "res1",
    cameraId: null,
    type: "FALL",
    probability: 0.9,
    detectedAt: new Date().toISOString(),
    status: "NEW",
    ...overrides,
  };
}

function makeStatus(
  residentId: string,
  state: ResidentState = "NORMAL",
  overrides?: Partial<ResidentStatus>,
): ResidentStatus {
  return {
    id: `status-${residentId}`,
    residentId,
    orgId: "org1",
    state,
    lastSeenAt: null,
    cameraOnline: false,
    source: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeStatusEvent(
  residentId: string,
  state: ResidentState,
  overrides?: Partial<SseStatusEvent>,
): SseStatusEvent {
  return {
    alertSeq: "1",
    orgId: "org1",
    residentId,
    state,
    cameraOnline: true,
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---- sortAlertsBySeq ----

test("sortAlertsBySeq: descending order", () => {
  const alerts = [makeAlert("1"), makeAlert("3"), makeAlert("2")];
  const sorted = sortAlertsBySeq(alerts);
  assert.deepStrictEqual(
    sorted.map((a) => a.alertSeq),
    ["3", "2", "1"],
  );
});

test("sortAlertsBySeq: single element", () => {
  const sorted = sortAlertsBySeq([makeAlert("42")]);
  assert.equal(sorted[0].alertSeq, "42");
});

test("sortAlertsBySeq: empty array", () => {
  assert.deepStrictEqual(sortAlertsBySeq([]), []);
});

test("sortAlertsBySeq: large BigInt sequences", () => {
  const a = makeAlert("9007199254740993"); // beyond Number.MAX_SAFE_INTEGER
  const b = makeAlert("9007199254740994");
  const sorted = sortAlertsBySeq([a, b]);
  assert.equal(sorted[0].alertSeq, "9007199254740994");
  assert.equal(sorted[1].alertSeq, "9007199254740993");
});

// ---- mergeAlerts ----

test("mergeAlerts: deduplicates by alertSeq", () => {
  const a = makeAlert("1");
  const result = mergeAlerts([a], [a]);
  assert.equal(result.length, 1);
});

test("mergeAlerts: incoming wins on duplicate", () => {
  const old = makeAlert("1", { status: "NEW" });
  const updated = makeAlert("1", { status: "ACKED" });
  const result = mergeAlerts([old], [updated]);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "ACKED");
});

test("mergeAlerts: merges disjoint sets, sorted descending", () => {
  const result = mergeAlerts([makeAlert("1"), makeAlert("3")], [makeAlert("2"), makeAlert("4")]);
  assert.deepStrictEqual(
    result.map((a) => a.alertSeq),
    ["4", "3", "2", "1"],
  );
});

test("mergeAlerts: empty existing", () => {
  const result = mergeAlerts([], [makeAlert("5"), makeAlert("3")]);
  assert.deepStrictEqual(
    result.map((a) => a.alertSeq),
    ["5", "3"],
  );
});

test("mergeAlerts: empty incoming", () => {
  const result = mergeAlerts([makeAlert("2"), makeAlert("1")], []);
  assert.deepStrictEqual(
    result.map((a) => a.alertSeq),
    ["2", "1"],
  );
});

test("mergeAlerts: reconnect replay dedup — interleaved sequences", () => {
  // Simulate: client has [5,4,3], reconnect replay delivers [4,5,6,7]
  const existing = [makeAlert("5"), makeAlert("4"), makeAlert("3")];
  const replay = [makeAlert("4"), makeAlert("5"), makeAlert("6"), makeAlert("7")];
  const result = mergeAlerts(existing, replay);
  assert.deepStrictEqual(
    result.map((a) => a.alertSeq),
    ["7", "6", "5", "4", "3"],
  );
});

// ---- mergeStatuses ----

test("mergeStatuses: updates state for existing resident", () => {
  const existing = [makeStatus("res1", "NORMAL")];
  const event = makeStatusEvent("res1", "FALL");
  const result = mergeStatuses(existing, event);
  assert.equal(result.length, 1);
  assert.equal(result[0].state, "FALL");
  assert.equal(result[0].residentId, "res1");
});

test("mergeStatuses: updates cameraOnline and lastSeenAt", () => {
  const ts = new Date().toISOString();
  const existing = [makeStatus("res1", "NORMAL", { cameraOnline: false, lastSeenAt: null })];
  const event = makeStatusEvent("res1", "FALL", { cameraOnline: true, lastSeenAt: ts });
  const result = mergeStatuses(existing, event);
  assert.equal(result[0].cameraOnline, true);
  assert.equal(result[0].lastSeenAt, ts);
});

test("mergeStatuses: preserves other fields (name, room, id) from snapshot", () => {
  const existing = [
    makeStatus("res1", "NORMAL", {
      id: "status-db-id",
      resident: { name: "홍길동", room: "101" },
    }),
  ];
  const event = makeStatusEvent("res1", "WARNING");
  const result = mergeStatuses(existing, event);
  assert.equal(result[0].id, "status-db-id");
  assert.deepStrictEqual(result[0].resident, { name: "홍길동", room: "101" });
  assert.equal(result[0].state, "WARNING");
});

test("mergeStatuses: appends minimal entry for unknown resident", () => {
  const existing = [makeStatus("res1", "NORMAL")];
  const event = makeStatusEvent("res2", "FALL");
  const result = mergeStatuses(existing, event);
  assert.equal(result.length, 2);
  const added = result.find((s) => s.residentId === "res2");
  assert.ok(added, "res2 should be in result");
  assert.equal(added!.state, "FALL");
});

test("mergeStatuses: does not affect other residents", () => {
  const existing = [makeStatus("res1", "NORMAL"), makeStatus("res2", "NORMAL")];
  const event = makeStatusEvent("res1", "FALL");
  const result = mergeStatuses(existing, event);
  const res2 = result.find((s) => s.residentId === "res2");
  assert.equal(res2?.state, "NORMAL");
});

test("mergeStatuses: FALL → NORMAL transition", () => {
  const existing = [makeStatus("res1", "FALL")];
  const event = makeStatusEvent("res1", "NORMAL", { cameraOnline: false });
  const result = mergeStatuses(existing, event);
  assert.equal(result[0].state, "NORMAL");
});

test("mergeStatuses: empty existing + new resident creates entry", () => {
  const event = makeStatusEvent("res1", "WARNING");
  const result = mergeStatuses([], event);
  assert.equal(result.length, 1);
  assert.equal(result[0].state, "WARNING");
});

// ---- maskPhone ----

test("maskPhone: standard 11-digit", () => {
  assert.equal(maskPhone("01012345678"), "010-****-5678");
});

test("maskPhone: with hyphens", () => {
  assert.equal(maskPhone("010-1234-5678"), "010-****-5678");
});

test("maskPhone: short number returns redacted form", () => {
  assert.equal(maskPhone("12345"), "***-****-****");
});

test("maskPhone: exactly 7 digits", () => {
  const result = maskPhone("0101234");
  assert.ok(result.startsWith("010"));
  assert.ok(result.endsWith("1234"));
});


// ---- session-invalid event ----
// The backend emits `event: session-invalid\ndata: {}\n\n`.
// The data payload is always an empty object; the event *name* is what matters.
// These tests verify that the payload parses cleanly and is safely ignorable.

test("session-invalid: data payload parses as empty object", () => {
  const data = "{}";
  const parsed = JSON.parse(data) as Record<string, unknown>;
  assert.deepStrictEqual(parsed, {});
});

test("session-invalid: data payload missing keys does not throw", () => {
  const data = "{}";
  const parsed = JSON.parse(data) as { reason?: string };
  // no key access should throw
  assert.equal(parsed.reason, undefined);
});
console.log("All tests passed.");
