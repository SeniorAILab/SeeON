import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMockSse, __resetScheduler, __timersCreated } from "./sse";
import { __resetScenario } from "./scenario";
import type { SseAlert } from "./types";

describe("mock sse scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    __resetScenario();
    __resetScheduler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a single timer for multiple subscribers (idempotent)", () => {
    const stop1 = startMockSse(
      () => {},
      () => {},
    );
    const stop2 = startMockSse(
      () => {},
      () => {},
    );
    expect(__timersCreated()).toBe(1);
    stop1();
    stop2();
  });

  it("delivers one event per tick to every subscriber", () => {
    const a: SseAlert[] = [];
    const b: SseAlert[] = [];
    const stop1 = startMockSse(
      (alert) => a.push(alert),
      () => {},
      1000,
    );
    const stop2 = startMockSse(
      (alert) => b.push(alert),
      () => {},
      1000,
    );
    vi.advanceTimersByTime(1000);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].id).toBe(b[0].id); // same single generated event
    stop1();
    stop2();
  });

  it("stops the timer only when all subscribers unsubscribe", () => {
    const stop1 = startMockSse(
      () => {},
      () => {},
      1000,
    );
    const received: SseAlert[] = [];
    const stop2 = startMockSse(
      (alert) => received.push(alert),
      () => {},
      1000,
    );
    stop1();
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(1); // still ticking for stop2
    stop2();
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(1); // stopped after last unsubscribe
  });
});
