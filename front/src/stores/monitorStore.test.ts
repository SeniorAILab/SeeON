import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { DashboardResponse, Space, SpaceStatus } from "@/types";
const SCOPED_FACILITY_ID = "fac_happy_nokyang";
const activeSpace: Space = {
  id: "sp_201",
  facilityId: SCOPED_FACILITY_ID,
  floorId: "floor_2",
  name: "201호",
  type: "ROOM",
  capacity: 1,
  isActive: true,
};



function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const alertDto = {
  alertSeq: "10",
  id: "alert_201",
  facilityId: SCOPED_FACILITY_ID,
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

type CameraDto = {
  id: string;
  facilityId: string;
  spaceId: string;
  online: boolean;
  lastSeenAt: string | null;
};

/** 프로덕션과 같은 함정: online=true인데 lastSeenAt은 한참 전. */
const staleCameraDto: CameraDto = {
  id: "cam_sp_201",
  facilityId: SCOPED_FACILITY_ID,
  spaceId: "sp_201",
  online: true,
  lastSeenAt: "2026-06-20T00:00:00.000Z",
};

function dashboardFetch(
  alerts: unknown[] = [],
  spaces: Space[] = [activeSpace],
  cameras: CameraDto[] = []
) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) {
      return okJsonResponse({
        id: "user-1",
        email: "staff@sen.ai",
        nickname: "직원",
        role: "STAFF",
        facilityId: SCOPED_FACILITY_ID,
      });
    }
    const facilityMatch = url.match(/\/facilities\/([^/?]+)$/);
    if (facilityMatch) {
      const id = decodeURIComponent(facilityMatch[1]);
      return okJsonResponse({
        id,
        name: "행복요양원 녹양점",
        address: "경기도 의정부시",
        phone: "031-123-4567",
      });
    }
    if (url.endsWith("/cameras")) return okJsonResponse(cameras);
    if (url.endsWith("/floors")) return okJsonResponse([]);
    if (url.endsWith("/spaces")) return okJsonResponse(spaces);
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
  connection: "LIVE",
  lastSeenAt: "2026-08-03T11:59:30.000Z",
  alertStatus: "SENT",
  bedsideActivity: true,
  emergency: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function dashboardFor(
  facilityId: string,
  statuses: Record<string, SpaceStatus> = {},
  spaces: Space[] = [{ ...activeSpace, facilityId }],
): DashboardResponse {
  return {
    facility: {
      id: facilityId,
      name: facilityId,
      address: "Seoul",
      phone: "02-0000-0000",
    },
    floors: [],
    spaces,
    statuses,
    summary: {
      totalSpaces: Object.keys(statuses).length,
      stable: Object.values(statuses).filter((status) => status.status === "STABLE").length,
      caution: Object.values(statuses).filter((status) => status.status === "CAUTION").length,
      danger: Object.values(statuses).filter((status) => status.status === "DANGER").length,
      checkNeeded: Object.values(statuses).filter((status) => status.status === "CHECK_NEEDED").length,
      unacknowledged: 0,
    },
    unacknowledgedEvents: [],
  };
}

describe("monitorStore live alert merge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("@/services/dashboardService");
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
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);

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

    const { useRealtimeSpaceStatus } = await import("@/features/monitor/hooks/useRealtimeSpaceStatus");
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

  it("does not let a delayed dashboard response from a previous facility overwrite the active facility", async () => {
    const facilityA = deferred<DashboardResponse>();
    const facilityBDashboard = dashboardFor("facility-b", {});
    const getDashboard = vi.fn((facilityId: string) =>
      facilityId === "facility-a" ? facilityA.promise : Promise.resolve(facilityBDashboard)
    );
    vi.doMock("@/services/dashboardService", () => ({
      dashboardService: { getDashboard },
    }));
    vi.stubGlobal("EventSource", undefined);
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start("facility-a", 60_000);
    useMonitorStore.getState().start("facility-b", 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(useMonitorStore.getState().dashboard?.facility.id).toBe("facility-b");
    expect(useMonitorStore.getState().statuses).toEqual({});

    facilityA.resolve(dashboardFor("facility-a", { sp_201: dangerStatus }));
    await Promise.resolve();
    await Promise.resolve();

    expect(useMonitorStore.getState().dashboard?.facility.id).toBe("facility-b");
    expect(useMonitorStore.getState().statuses).toEqual({});

    useMonitorStore.getState().stop();
  });
  it("keeps danger when an older resolved alert arrives after a newer active alert", async () => {
    const sendMessage = stubEventSource();
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    sendMessage(newerAlertDto);
    sendMessage(olderResolvedAlertDto);

    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "DANGER",
      alertStatus: "PENDING",
      lastDetectedAt: newerAlertDto.detectedAt,
      emergency: false,
    });

    useMonitorStore.getState().stop();
  });

  it("keeps danger from another active alert when resolving an older alert", async () => {
    const olderActive = alertDtoWith({ id: "alert_older", alertSeq: "9", detectedAt: "2026-06-22T01:10:00.000Z" });
    const newerActive = alertDtoWith({ id: "alert_newer", alertSeq: "10", detectedAt: "2026-06-22T01:09:00.000Z" });
    const baseFetch = dashboardFetch([olderActive, newerActive]);
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts/alert_older/resolve") && init?.method === "PATCH") {
        return okJsonResponse({ ...olderActive, alertSeq: "11", status: "RESOLVED" });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    useMonitorStore.setState({ statuses: { sp_201: dangerStatus } });

    await useMonitorStore.getState().resolve("sp_201");

    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "DANGER",
      alertStatus: "PENDING",
      lastDetectedAt: newerActive.detectedAt,
      emergency: false,
    });

    useMonitorStore.getState().stop();
  });

  it("clears danger when resolving the only active alert", async () => {
    const baseFetch = dashboardFetch([alertDto]);
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts/alert_201/resolve") && init?.method === "PATCH") {
        return okJsonResponse({ ...alertDto, alertSeq: "11", status: "RESOLVED" });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    useMonitorStore.setState({ statuses: { sp_201: dangerStatus } });

    await useMonitorStore.getState().resolve("sp_201");

    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "STABLE",
      alertStatus: "ACKNOWLEDGED",
      emergency: false,
      bedsideActivity: false,
    });
    expect(useMonitorStore.getState().dashboard?.unacknowledgedEvents).toEqual([]);
    expect(useMonitorStore.getState().dashboard?.summary.unacknowledged).toBe(0);

    useMonitorStore.getState().stop();
  });

  it("selects the numeric max alertSeq active alert independent of arrival order", async () => {
    const sendMessage = stubEventSource();
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    sendMessage(alertDtoWith({ id: "alert_seq_10", alertSeq: "10", detectedAt: "2026-06-22T01:10:00.000Z" }));
    sendMessage(alertDtoWith({ id: "alert_seq_2", alertSeq: "2", detectedAt: "2026-06-22T01:02:00.000Z" }));

    expect(useMonitorStore.getState().statuses.sp_201.lastDetectedAt).toBe("2026-06-22T01:10:00.000Z");

    useMonitorStore.getState().stop();
  });
  it("recomputes the summary danger tally live from an SSE alert without a reload", async () => {
    const sendMessage = stubEventSource();
    vi.stubGlobal("fetch", dashboardFetch());

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(useMonitorStore.getState().dashboard?.summary.danger).toBe(0);

    sendMessage(alertDto);

    expect(useMonitorStore.getState().statuses.sp_201.status).toBe("DANGER");
    expect(useMonitorStore.getState().dashboard?.summary.danger).toBe(1);

    useMonitorStore.getState().stop();
  });

  it("records delivery only after a correlated SSE alert enters the normalized feed", async () => {
    const sendMessage = stubEventSource();
    const baseFetch = dashboardFetch();
    const correlatedAlert = {
      ...alertDto,
      id: "alert_receipt",
      backendEventId: "event_receipt",
      alertSeq: "88",
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/dashboard/receipts/delivery") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            deliveryId: "delivery-88",
            backendEventId: correlatedAlert.backendEventId,
            alertId: correlatedAlert.id,
            alertSeq: correlatedAlert.alertSeq,
            kind: "delivery",
            surface: "normalized-feed",
            observedAt: "2026-07-17T03:00:00.000Z",
            recordedAt: "2026-07-17T03:00:01.000Z",
            duplicate: false,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    sendMessage(correlatedAlert);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/dashboard/receipts/delivery",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"backendEventId":"event_receipt"'),
        }),
      ),
    );
    expect(
      useMonitorStore.getState().dashboard?.unacknowledgedEvents,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "alert_receipt",
          backendEventId: "event_receipt",
        }),
      ]),
    );

    useMonitorStore.getState().stop();
  });

  it("keeps inactive-space alerts out of live statuses and summary totals", async () => {
    const inactiveSpace: Space = { ...activeSpace, id: "sp_inactive", isActive: false };
    const inactiveAlert = alertDtoWith({ id: "alert_inactive", spaceId: inactiveSpace.id, alertSeq: "11" });
    vi.stubGlobal("fetch", dashboardFetch([alertDto, inactiveAlert], [activeSpace, inactiveSpace]));

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(useMonitorStore.getState().statuses).toMatchObject({ sp_201: { status: "DANGER" } });
    expect(useMonitorStore.getState().statuses).not.toHaveProperty(inactiveSpace.id);
    expect(useMonitorStore.getState().dashboard?.summary).toMatchObject({ totalSpaces: 1, danger: 1 });
    expect(useMonitorStore.getState().dashboard?.unacknowledgedEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: inactiveAlert.id })]),
    );

    useMonitorStore.getState().stop();
  });
});
describe("monitorStore resolve", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("@/services/dashboardService");
  });

  it("patches the backend alert by id and clears the room card danger state", async () => {
    const baseFetch = dashboardFetch([alertDto]);
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts/alert_201/resolve") && init?.method === "PATCH") {
        return okJsonResponse({ ...alertDto, status: "RESOLVED" });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 60_000);
    for (let i = 0; i < 30 && !useMonitorStore.getState().dashboard; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    useMonitorStore.setState({ statuses: { sp_201: dangerStatus } });

    await useMonitorStore.getState().resolve("sp_201");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/alerts/alert_201/resolve",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
    expect(useMonitorStore.getState().statuses.sp_201).toMatchObject({
      status: "STABLE",
      alertStatus: "ACKNOWLEDGED",
      emergency: false,
      bedsideActivity: false,
    });

    useMonitorStore.getState().stop();
  });
});

describe("sse-independent — REST 성공이 SSE 장애를 덮지 않는다", () => {
  function stubEventSourceWithHandles() {
    const close = vi.fn();
    const handle: {
      onopen?: () => void;
      onerror?: () => void;
    } = {};
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const source = {
          addEventListener: vi.fn(),
          close,
          set onopen(fn: () => void) {
            handle.onopen = fn;
          },
          set onerror(fn: () => void) {
            handle.onerror = fn;
          },
        };
        return source;
      })
    );
    return handle;
  }

  it("SSE가 끊긴 뒤 REST 폴링이 성공해도 connection이 NORMAL로 돌아가지 않는다", async () => {
    vi.stubGlobal("fetch", dashboardFetch([], [activeSpace], [staleCameraDto]));
    const sse = stubEventSourceWithHandles();

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 10);
    sse.onopen?.();
    await waitFor(() => expect(useMonitorStore.getState().connection).toBe("NORMAL"));

    // SSE 단절. 이 시점부터 REST는 계속 200을 준다.
    sse.onerror?.();

    await waitFor(() => expect(useMonitorStore.getState().connection).toBe("RECONNECTING"));
    // REST 폴링이 여러 번 성공해도 여전히 RECONNECTING이어야 한다.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(useMonitorStore.getState().connection).toBe("RECONNECTING");

    useMonitorStore.getState().stop();
  });

  it("SSE가 열리기 전에는 REST 성공만으로 NORMAL을 주장하지 않는다", async () => {
    vi.stubGlobal("fetch", dashboardFetch([], [activeSpace], [staleCameraDto]));
    stubEventSourceWithHandles();

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 10);
    await waitFor(() => expect(useMonitorStore.getState().statuses.sp_201).toBeDefined());
    expect(useMonitorStore.getState().connection).toBe("RECONNECTING");

    useMonitorStore.getState().stop();
  });
});

describe("camera freshness — 죽은 카메라를 정상으로 표시하지 않는다", () => {
  it("online=true라도 lastSeenAt이 오래됐으면 STALE로 실린다", async () => {
    vi.stubGlobal("fetch", dashboardFetch([], [activeSpace], [staleCameraDto]));
    vi.stubGlobal("EventSource", undefined);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 10_000);
    await waitFor(() => expect(useMonitorStore.getState().statuses.sp_201).toBeDefined());

    const status = useMonitorStore.getState().statuses.sp_201;
    expect(status.connection).toBe("STALE");
    expect(status.lastSeenAt).toBe("2026-06-20T00:00:00.000Z");
    // 위험도는 신선도에 덮이지 않는다.
    expect(status.status).toBe("STABLE");

    useMonitorStore.getState().stop();
  });

  it("카메라가 방금 heartbeat를 보냈으면 LIVE로 실린다", async () => {
    const liveCamera: CameraDto = { ...staleCameraDto, lastSeenAt: new Date().toISOString() };
    vi.stubGlobal("fetch", dashboardFetch([], [activeSpace], [liveCamera]));
    vi.stubGlobal("EventSource", undefined);

    const { useMonitorStore } = await import("./monitorStore");
    useMonitorStore.getState().start(SCOPED_FACILITY_ID, 10_000);
    await waitFor(() => expect(useMonitorStore.getState().statuses.sp_201).toBeDefined());

    expect(useMonitorStore.getState().statuses.sp_201.connection).toBe("LIVE");

    useMonitorStore.getState().stop();
  });
});
