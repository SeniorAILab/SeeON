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
  init?: EventSourceInit;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close: ReturnType<typeof vi.fn>;
  listeners: Map<string, Array<(event: Event) => void>>;
  emit: (type: string) => void;
}

const eventSources: MockEventSourceInstance[] = [];

class MockEventSource implements MockEventSourceInstance {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readonly url: string;
  readonly init?: EventSourceInit;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  listeners = new Map<string, Array<(event: Event) => void>>();
  readyState = MockEventSource.OPEN;
  withCredentials = false;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.init = init;
    this.withCredentials = Boolean(init?.withCredentials);
    eventSources.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((item) => item !== listener)
    );
  }

  dispatchEvent(event: Event): boolean {
    if (event.type === "message") {
      this.onmessage?.(event as MessageEvent);
    }
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
    return true;
  }

  emit(type: string) {
    this.dispatchEvent(new MessageEvent(type, { data: "{}" }));
  }
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

async function importHook({ mockMode = false } = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCK", mockMode ? "true" : "false");
  vi.stubEnv("VITE_API_BASE_URL", undefined);
  const [{ useAuthStore }, { useFacilityStore }, { useDashboard }] =
    await Promise.all([
      import("@/store/authStore"),
      import("@/store/facilityStore"),
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

  return { useDashboard, useFacilityStore };
}

describe("useDashboard SSE refresh", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    getDashboardMock.mockReset();
    getDashboardMock.mockResolvedValue(dashboardResponse());
    eventSources.length = 0;
    vi.stubGlobal("EventSource", MockEventSource);
  });

  it("opens one EventSource connection per mounted hook in real mode", async () => {
    const { useDashboard } = await importHook();

    renderHook(() => useDashboard());

    await waitFor(() => expect(getDashboardMock).toHaveBeenCalledTimes(1));
    expect(eventSources).toHaveLength(1);
    expect(eventSources[0].url).toBe("/api/v1/dashboard/stream");
  });

  it("reloads on default alert, named status, and named status-snapshot events", async () => {
    const { useDashboard } = await importHook();
    renderHook(() => useDashboard());
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalledTimes(1));

    act(() => eventSources[0].emit("message"));
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalledTimes(2));

    act(() => eventSources[0].emit("status"));
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalledTimes(3));

    act(() => eventSources[0].emit("status-snapshot"));
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalledTimes(4));
  });

  it("closes the EventSource connection on cleanup", async () => {
    const { useDashboard } = await importHook();
    const { unmount } = renderHook(() => useDashboard());
    await waitFor(() => expect(eventSources).toHaveLength(1));

    unmount();

    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
  });

  it("closes and reopens the EventSource connection when the facility changes", async () => {
    const { useDashboard, useFacilityStore } = await importHook();
    renderHook(() => useDashboard());
    await waitFor(() => expect(eventSources).toHaveLength(1));

    act(() => useFacilityStore.setState({ currentFacilityId: "facility-2" }));

    await waitFor(() => expect(eventSources).toHaveLength(2));
    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
    expect(eventSources[1].url).toBe("/api/v1/dashboard/stream");
  });

  it("keeps polling as a fallback when EventSource is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", undefined);
    const { useDashboard } = await importHook();

    renderHook(() => useDashboard(1_000));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getDashboardMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(getDashboardMock).toHaveBeenCalledTimes(2);
    expect(eventSources).toHaveLength(0);
  });

  it("test_vite_use_mock_true_preserves_mock_realtime_engine", async () => {
    vi.useFakeTimers();
    const { useDashboard } = await importHook({ mockMode: true });

    renderHook(() => useDashboard(1_000));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getDashboardMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(getDashboardMock).toHaveBeenCalledTimes(2);
    expect(eventSources).toHaveLength(0);
  });
});
