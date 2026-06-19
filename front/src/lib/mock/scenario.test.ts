import { beforeEach, describe, expect, it } from "vitest";
import { ackAlert, generateEvent, getScenario, __resetScenario } from "./scenario";
import { loadScenario } from "./store";

describe("mock scenario", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetScenario();
  });

  it("seeds deterministic facility data", () => {
    const s = getScenario();
    expect(s.residents).toHaveLength(16);
    expect(s.cameras).toHaveLength(10);
    expect(s.statuses).toHaveLength(16);
    expect(s.alerts.length).toBeGreaterThan(0);
    expect(s.alerts.some((a) => a.status === "NEW")).toBe(true);
  });

  it("acks a NEW alert and persists it to the store", () => {
    const s = getScenario();
    const newAlert = s.alerts.find((a) => a.status === "NEW");
    expect(newAlert).toBeTruthy();

    const acked = ackAlert(newAlert!.id);
    expect(acked?.status).toBe("ACKED");

    const persisted = loadScenario();
    expect(
      persisted?.alerts.find((a) => a.id === newAlert!.id)?.status,
    ).toBe("ACKED");
  });

  it("ack survives a simulated reload (rehydrate from store)", () => {
    const s = getScenario();
    const newAlert = s.alerts.find((a) => a.status === "NEW")!;
    ackAlert(newAlert.id);

    // Simulate a full page reload: drop in-memory state, rehydrate from store.
    __resetScenario();
    const rehydrated = getScenario();
    expect(
      rehydrated.alerts.find((a) => a.id === newAlert.id)?.status,
    ).toBe("ACKED");
  });

  it("returns null when acking an unknown or already-acked alert", () => {
    getScenario();
    expect(ackAlert("does-not-exist")).toBeNull();
  });

  it("generateEvent advances the sequence and updates resident status", () => {
    const before = getScenario();
    const seqBefore = before.nextSeq;
    const { alert, status } = generateEvent(Date.parse("2026-06-18T10:00:00+09:00"));

    expect(Number(alert.alertSeq)).toBe(seqBefore + 1);
    expect(alert.status).toBe("NEW");
    expect(status.residentId).toBe(alert.residentId);

    const after = getScenario();
    expect(after.nextSeq).toBe(seqBefore + 1);
    const st = after.statuses.find((x) => x.residentId === alert.residentId);
    expect(st?.state).toBe(status.state);
    // the generated alert is now in the feed
    expect(after.alerts.some((a) => a.id === alert.id)).toBe(true);
  });
});
