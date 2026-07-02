import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { SpaceStatus } from "@/types";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const alertDto = {
  alertSeq: "10",
  id: "alert_201",
  facilityId: "fac_happy_nokyang",
  residentId: null,
  cameraId: "cam_sp_201",
  spaceId: "sp_201",
  room: "201호",
  type: "bed-exit",
  probability: 0.92,
  detectedAt: "2026-06-22T01:00:00.000Z",
  status: "NEW",
};

const newerAlertDto = {
  ...alertDto,
  alertSeq: "10",
  id: "alert_newer",
  detectedAt: "2026-06-22T01:10:00.000Z",
  status: "NEW",
};

const olderResolvedAlertDto = {
  ...alertDto,
  alertSeq: "9",
  id: "alert_older",
  detectedAt: "2026-06-22T01:09:00.000Z",
  status: "RESOLVED",
};

function alertDtoWith(overrides: Partial<typeof alertDto> = {}) {
  return { ...alertDto, ...overrides };
}

function dashboardFetch(alerts: unknown[] = []) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) {
      return okJsonResponse({
        id: "user-1",
        email: "staff@sen.ai",
        nickname: "직원",
        role: "STAFF",
        facilityId: "fac_happy_nokyang",
      });
    }
    if (url.endsWith("/facilities/fac_happy_nokyang")) {
      return okJsonResponse({
        id: "fac_happy_nokyang",
        name: "행복요양원 녹양점",
        address: "경기도 의정부시",
        code: "happy-nokyang",
        phone: "031-123-4567",
      });
    }
    if (url.endsWith("/floors")) return okJsonResponse([]);
    if (url.endsWith("/spaces")) {
      return okJsonResponse([{ id: "sp_201", facilityId: "fac_happy_nokyang", floorId: "floor_2", name: "201호" }]);
    }
    if ((url.endsWith("/alerts") || url.endsWith("/alerts?status=NEW")) && !init?.method) return okJsonResponse(alerts);
    throw new Error(`Unexpected request ${url}`);
  });
}

function stubEventSource() {
  let alertListener: ((event: MessageEvent) => void) | null = null;
  const close = vi.fn();
  vi.stubGlobal(
    "EventSource",
    vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
        if (type === "alert") alertListener = handler;
      }),
      close,
    }))
  );
  return (data: unknown) => alertListener?.(new MessageEvent("alert", { data: JSON.stringify(data) }));
}

const dangerStatus: SpaceStatus = {
  id: "status-sp_201",
  spaceId: "sp_201",
  peopleCount: 0,
  movementLevel: "HIGH",
  fallRiskLevel: "HIGH",
  status: "DANGER",
  aiSummary: "침상 이탈이 감지되었습니다.",
  lastDetectedAt: "2026-06-22T01:00:00.000Z",
  kakaoAlertStatus: "SENT",
  bedsideActivity: true,
  emergency: true,
};

describe("monitorStore live alert merge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_USE_MOCK", "false");
  });

  it("keeps one EventSource when start is called twice for the same facility", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => ({
        addEventListener: vi.fn(),
        close,
      }))
    );
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start("fac_happy_nokyang", 60_000);
    useMonitorStore.getState().start("fac_happy_nokyang", 60_000);

    expect(EventSource).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    useMonitorStore.getState().stop();
  });

  it("closes the prior EventSource when start changes facility", async () => {
    const closes: ReturnType<typeof vi.fn>[] = [];
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const close = vi.fn();
        closes.push(close);
        return {
          addEventListener: vi.fn(),
          close,
        };
      })
    );
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start("facility-a", 60_000);
    useMonitorStore.getState().start("facility-b", 60_000);

    expect(EventSource).toHaveBeenCalledTimes(2);
    expect(closes[0]).toHaveBeenCalledTimes(1);
    expect(closes[1]).not.toHaveBeenCalled();

    useMonitorStore.getState().stop();
  });

  it("useRealtimeSpaceStatus cleans up EventSource on facility change and unmount", async () => {
    const closes: ReturnType<typeof vi.fn>[] = [];
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const close = vi.fn();
        closes.push(close);
        return {
          addEventListener: vi.fn(),
          close,
        };
      })
    );
    vi.stubGlobal("fetch", dashboardFetch());

    const { useRealtimeSpaceStatus } = await import("@/hooks/useRealtimeSpaceStatus");
    const { rerender, unmount } = renderHook(
      ({ facilityId }) => useRealtimeSpaceStatus(facilityId, []),
      { initialProps: { facilityId: "facility-a" } }
    );

    rerender({ facilityId: "facility-b" });
    expect(EventSource).toHaveBeenCalledTimes(2);
    expect(closes[0]).toHaveBeenCalledTimes(1);

    unmount();
    expect(closes[1]).toHaveBeenCalledTimes(1);
  });
  it("keeps danger when an older resolved alert arrives after a newer active alert", async () => {
    const sendMessage = stubEventSource();
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start("fac_happy_nokyang", 60_000);
    await Promise.resolve();
    await Promise.resolve();

    sendMessage(newerAlertDto);
    sendMessage(olderResolvedAlertDto);

    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "DANGER",
      kakaoAlertStatus: "PENDING",
      lastDetectedAt: newerAlertDto.detectedAt,
      emergency: true,
    });

    useMonitorStore.getState().stop();
  });

  it("keeps danger from another active alert when resolving an older alert", async () => {
    const olderActive = alertDtoWith({ id: "alert_older", alertSeq: "9", detectedAt: "2026-06-22T01:10:00.000Z" });
    const newerActive = alertDtoWith({ id: "alert_newer", alertSeq: "10", detectedAt: "2026-06-22T01:09:00.000Z" });
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts?status=NEW") && !init?.method) return okJsonResponse([olderActive, newerActive]);
      if (url.endsWith("/alerts/alert_older/resolve") && init?.method === "PATCH") {
        return okJsonResponse({ ...olderActive, alertSeq: "11", status: "RESOLVED" });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.setState({ statuses: { sp_201: dangerStatus } });

    await useMonitorStore.getState().resolve("sp_201");

    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "DANGER",
      kakaoAlertStatus: "PENDING",
      lastDetectedAt: newerActive.detectedAt,
      emergency: true,
    });
  });

  it("clears danger when resolving the only active alert", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts?status=NEW") && !init?.method) return okJsonResponse([alertDto]);
      if (url.endsWith("/alerts/alert_201/resolve") && init?.method === "PATCH") {
        return okJsonResponse({ ...alertDto, alertSeq: "11", status: "RESOLVED" });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.setState({ statuses: { sp_201: dangerStatus } });

    await useMonitorStore.getState().resolve("sp_201");

    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "STABLE",
      kakaoAlertStatus: "ACKNOWLEDGED",
      emergency: false,
      bedsideActivity: false,
    });
  });

  it("selects the numeric max alertSeq active alert independent of arrival order", async () => {
    const sendMessage = stubEventSource();
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start("fac_happy_nokyang", 60_000);
    await Promise.resolve();
    await Promise.resolve();

    sendMessage(alertDtoWith({ id: "alert_seq_10", alertSeq: "10", detectedAt: "2026-06-22T01:10:00.000Z" }));
    sendMessage(alertDtoWith({ id: "alert_seq_2", alertSeq: "2", detectedAt: "2026-06-22T01:02:00.000Z" }));

    expect(useMonitorStore.getState().statuses.sp_201.lastDetectedAt).toBe("2026-06-22T01:10:00.000Z");

    useMonitorStore.getState().stop();
  });
});
describe("monitorStore resolve", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_USE_MOCK", "false");
  });

  it("patches the backend alert by id and clears the room card danger state", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts?status=NEW") && !init?.method) return okJsonResponse([alertDto]);
      if (url.endsWith("/alerts/alert_201/resolve") && init?.method === "PATCH") {
        return okJsonResponse({ ...alertDto, status: "RESOLVED" });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.setState({ statuses: { sp_201: dangerStatus } });

    await useMonitorStore.getState().resolve("sp_201");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/alerts/alert_201/resolve",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "STABLE",
      kakaoAlertStatus: "ACKNOWLEDGED",
      emergency: false,
      bedsideActivity: false,
    });
  });
});
