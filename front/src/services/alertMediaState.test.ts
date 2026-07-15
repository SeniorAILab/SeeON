import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/apiClient";
import type { AlertMediaMetadata } from "./api/alertMedia";
import {
  createAlertMediaCoordinator,
  createAlertMediaRequestKey,
  reduceAlertMediaState,
  type AlertMediaPanelState,
} from "./alertMediaState";

class TestSetupError extends Error {
  readonly name = "TestSetupError";
}

class Deferred<T> {
  private resolver: ((value: T) => void) | null = null;
  readonly promise = new Promise<T>((resolve) => {
    this.resolver = resolve;
  });

  resolve(value: T): void {
    const resolver = this.resolver;
    if (resolver === null) throw new TestSetupError("Deferred resolver missing");
    resolver(value);
  }
}

const PENDING_MEDIA: AlertMediaMetadata = {
  status: "PENDING",
  alertId: "alert-1",
  retryAfterSeconds: null,
};

const READY_MEDIA: AlertMediaMetadata = {
  status: "READY",
  alertId: "alert-1",
  clip: {
    contentType: "video/mp4",
    detectedAt: "2026-07-16T00:00:10.000Z",
    clipStartAt: "2026-07-16T00:00:00.000Z",
    clipEndAt: "2026-07-16T00:00:20.000Z",
    durationSeconds: 20,
  },
};

describe("alert media state reducer", () => {
  const requestKey = "facility-1:alert-1:user-1";
  const loading: AlertMediaPanelState = { kind: "LOADING", requestKey };

  it.each([
    [PENDING_MEDIA, "PENDING"],
    [READY_MEDIA, "READY"],
    [{ status: "UNAVAILABLE", alertId: "alert-1" }, "UNAVAILABLE"],
    [{ status: "EXPIRED", alertId: "alert-1", expiredAt: "2026-07-16T01:00:00.000Z" }, "EXPIRED"],
    [{ status: "DELETED", alertId: "alert-1", deletedAt: "2026-07-16T01:00:00.000Z" }, "DELETED"],
  ] satisfies readonly (readonly [AlertMediaMetadata, AlertMediaPanelState["kind"]])[])(
    "maps metadata to the explicit %s panel state",
    (metadata, expectedKind) => {
      const state = reduceAlertMediaState(loading, {
        type: "METADATA_LOADED",
        requestKey,
        metadata,
      });

      expect(state.kind).toBe(expectedKind);
    },
  );

  it.each([
    [new ApiError(401, "Unauthorized"), "DENIED", false],
    [new ApiError(403, "Forbidden"), "DENIED", false],
    [new ApiError(404, "Not Found"), "UNAVAILABLE", false],
    [new ApiError(429, "Too Many Requests"), "ERROR", true],
    [new ApiError(500, "Unavailable"), "ERROR", true],
    [new TypeError("network failed"), "ERROR", true],
  ] as const)("maps transport failures without inventing lifecycle", (error, kind, retryable) => {
    const state = reduceAlertMediaState(loading, {
      type: "REQUEST_FAILED",
      requestKey,
      error,
    });

    expect(state.kind).toBe(kind);
    if (state.kind === "ERROR") expect(state.retryable).toBe(retryable);
  });

  it("ignores a completed action from a stale request key", () => {
    const state = reduceAlertMediaState(loading, {
      type: "METADATA_LOADED",
      requestKey: "facility-1:old-alert:user-1",
      metadata: READY_MEDIA,
    });

    expect(state).toBe(loading);
  });
});

describe("alert media request coordinator", () => {
  it("aborts the old alert request and ignores its late READY response", async () => {
    const alertA = new Deferred<AlertMediaMetadata>();
    const alertB = new Deferred<AlertMediaMetadata>();
    const signals: AbortSignal[] = [];
    const loadMetadata = vi.fn((alertId: string, signal: AbortSignal) => {
      signals.push(signal);
      return alertId === "alert-a" ? alertA.promise : alertB.promise;
    });
    const coordinator = createAlertMediaCoordinator(loadMetadata);
    const states: AlertMediaPanelState[] = [];

    const loadA = coordinator.load(
      { facilityId: "facility-1", alertId: "alert-a", userId: "user-1" },
      (state) => states.push(state),
    );
    const loadB = coordinator.load(
      { facilityId: "facility-1", alertId: "alert-b", userId: "user-1" },
      (state) => states.push(state),
    );

    expect(signals[0]?.aborted).toBe(true);
    alertB.resolve({ status: "UNAVAILABLE", alertId: "alert-b" });
    await loadB;
    alertA.resolve({ ...READY_MEDIA, alertId: "alert-a" });
    await loadA;

    expect(states.at(-1)).toEqual({
      kind: "UNAVAILABLE",
      requestKey: "facility-1:alert-b:user-1",
    });
    expect(states.some((state) => state.kind === "READY")).toBe(false);
  });

  it("aborts the old facility request even when the alert id is unchanged", async () => {
    const facilityA = new Deferred<AlertMediaMetadata>();
    const facilityB = new Deferred<AlertMediaMetadata>();
    const signals: AbortSignal[] = [];
    let callCount = 0;
    const loadMetadata = vi.fn((_alertId: string, signal: AbortSignal) => {
      signals.push(signal);
      callCount += 1;
      return callCount === 1 ? facilityA.promise : facilityB.promise;
    });
    const coordinator = createAlertMediaCoordinator(loadMetadata);
    const states: AlertMediaPanelState[] = [];

    const loadA = coordinator.load(
      { facilityId: "facility-a", alertId: "alert-1", userId: "user-1" },
      (state) => states.push(state),
    );
    const loadB = coordinator.load(
      { facilityId: "facility-b", alertId: "alert-1", userId: "user-1" },
      (state) => states.push(state),
    );

    expect(signals[0]?.aborted).toBe(true);
    facilityB.resolve({ status: "UNAVAILABLE", alertId: "alert-1" });
    await loadB;
    facilityA.resolve(READY_MEDIA);
    await loadA;

    expect(states.at(-1)?.requestKey).toBe("facility-b:alert-1:user-1");
    expect(states.some((state) => state.kind === "READY")).toBe(false);
  });

  it("builds the cancellation key from facility, alert, and user identity", () => {
    expect(createAlertMediaRequestKey({
      facilityId: "facility-1",
      alertId: "alert-1",
      userId: "user-1",
    })).toBe("facility-1:alert-1:user-1");
  });

  it("does not retain the controller after its request completes", async () => {
    const completedSignals: AbortSignal[] = [];
    const coordinator = createAlertMediaCoordinator((_alertId, signal) => {
      completedSignals.push(signal);
      return Promise.resolve({
        status: "UNAVAILABLE",
        alertId: "alert-1",
      });
    });

    await coordinator.load(
      { facilityId: "facility-1", alertId: "alert-1", userId: "user-1" },
      vi.fn(),
    );
    coordinator.cancel();

    expect(completedSignals[0]?.aborted).toBe(false);
  });
});
