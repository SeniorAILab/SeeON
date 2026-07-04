import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardResponse } from "@/types";

const getDashboardMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getDashboard: getDashboardMock,
  },
}));

interface MockEventSourceInstance {
  url: string;
  close: ReturnType<typeof vi.fn>;
}

const eventSources: MockEventSourceInstance[] = [];

class MockEventSource {
  close = vi.fn();
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    eventSources.push(this);
  }

  addEventListener() {}
}

function dashboardResponse(): DashboardResponse {
  return {
    facility: {
      id: "facility-1",
      name: "Happy Care",
      code: "happy-care",
      address: "Seoul",
      phone: "02-0000-0000",
    },
    floors: [],
    spaces: [],
    statuses: {},
    summary: {
      totalSpaces: 0,
      stable: 0,
      caution: 0,
      danger: 0,
      checkNeeded: 0,
      unacknowledged: 0,
    },
    unacknowledgedEvents: [],
  };
}

async function importHook() {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", undefined);
  const [{ useAuthStore }, { useFacilityStore }, { useMonitorStore }, { useDashboard }] =
    await Promise.all([
      import("@/stores/authStore"),
      import("@/stores/facilityStore"),
      import("@/stores/monitorStore"),
      import("./useDashboard"),
    ]);

  useAuthStore.setState({
    user: {
      id: "user-1",
      name: "Staff",
      email: "staff@example.test",
      role: "STAFF",
      facilityId: "facility-1",
    },
    initialized: true,
    loading: false,
    error: null,
  });
  useFacilityStore.setState({ currentFacilityId: "facility-1" });

  return { useDashboard, useFacilityStore, useMonitorStore };
}

describe("useDashboard single live store", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    getDashboardMock.mockReset();
    getDashboardMock.mockResolvedValue(dashboardResponse());
    eventSources.length = 0;
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
  });

  it("mounts multiple dashboard consumers through one monitorStore EventSource", async () => {
    const { useDashboard } = await importHook();

    renderHook(() => useDashboard());
    renderHook(() => useDashboard());

    await waitFor(() => expect(getDashboardMock).toHaveBeenCalledTimes(1));
    expect(eventSources).toHaveLength(1);
    expect(eventSources[0].url).toBe("/api/v1/dashboard/stream?facilityId=facility-1");
  });

  it("reuses monitorStore reload for admin dashboard refresh", async () => {
    const { useDashboard } = await importHook();
    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.data?.facility.id).toBe("facility-1"));
    await act(async () => {
      await result.current.reload();
    });

    expect(getDashboardMock).toHaveBeenCalledTimes(2);
    expect(eventSources).toHaveLength(1);
  });

  it("moves the single connection when the facility changes", async () => {
    const { useDashboard, useFacilityStore } = await importHook();
    renderHook(() => useDashboard());
    await waitFor(() => expect(eventSources).toHaveLength(1));

    act(() => useFacilityStore.setState({ currentFacilityId: "facility-2" }));

    await waitFor(() => expect(eventSources).toHaveLength(2));
    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
    expect(eventSources[1].url).toBe("/api/v1/dashboard/stream?facilityId=facility-2");
  });
});
