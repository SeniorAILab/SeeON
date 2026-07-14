import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FloorMonitorPage } from "./FloorMonitorPage";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import { useMonitorSettingsStore } from "@/features/monitor/stores/monitorSettingsStore";
import { dashboardService } from "@/services/dashboardService";

const useTTSAlertsMock = vi.fn();
const roomStatusBoardMock = vi.fn((_props: unknown) => <div />);
const facilityId = "fac_happy_nokyang";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
    useParams: () => ({ floorId: "fl_2f" }),
  };
});
vi.mock("@/features/monitor/hooks/useTTSAlerts", () => ({
  buildTTSAlerts: vi.fn(() => []),
  useTTSAlerts: (...args: unknown[]) => useTTSAlertsMock(...args),
}));
vi.mock("@/features/monitor/hooks/useRealtimeSpaceStatus", () => ({
  useRealtimeSpaceStatus: () => ({
    statuses: {},
    sortedSpaces: [],
    summary: { totalSpaces: 0, stable: 0, caution: 0, danger: 0, checkNeeded: 0, unacknowledged: 0 },
    totalPeople: 0,
    connection: "CONNECTED",
    lastUpdateAt: null,
  }),
}));
vi.mock("@/features/monitor/components/MonitorHeader", () => ({ MonitorHeader: () => <div /> }));
vi.mock("@/components/status/RoomStatusBoard", () => ({
  RoomStatusBoard: (props: unknown) => roomStatusBoardMock(props),
}));
vi.mock("@/services/dashboardService", () => ({ dashboardService: { getDashboard: vi.fn() } }));

describe("FloorMonitorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: "staff-1", name: "Care Staff", email: "staff@example.test", role: "STAFF", facilityId },
      loading: false,
      error: null,
      initialized: true,
    });
    useFacilityStore.setState({ currentFacilityId: null });
    useMonitorSettingsStore.setState({
      defaultFloorId: "fl_2f",
      refreshMs: 6000,
      alertSound: false,
      nightMode: false,
      cardSize: "xl",
      visibleSpaceIds: null,
      allowAllView: true,
    });
    vi.mocked(dashboardService.getDashboard).mockResolvedValue({
      facility: { id: facilityId, name: "행복요양원", address: "의정부시", phone: "031" },
      floors: [{ id: "fl_2f", facilityId, name: "2F", orderIndex: 2 }],
      spaces: [],
      statuses: {},
      summary: { totalSpaces: 0, stable: 0, caution: 0, danger: 0, checkNeeded: 0, unacknowledged: 0 },
      unacknowledgedEvents: [],
    });
  });

  it("uses the persisted alert-sound setting for TTS and passes card size to the board", async () => {
    render(<FloorMonitorPage />);

    await waitFor(() => expect(roomStatusBoardMock).toHaveBeenCalled());
    expect(useTTSAlertsMock).toHaveBeenLastCalledWith([], false);
    expect(roomStatusBoardMock.mock.calls.at(-1)?.[0]).toMatchObject({ cardSize: "xl" });

    useMonitorSettingsStore.getState().update({ alertSound: true });

    await waitFor(() => expect(useTTSAlertsMock).toHaveBeenLastCalledWith([], true));
  });
  it("redirects legacy all-view settings to a configured floor when all-view is disabled", async () => {
    useMonitorSettingsStore.setState({ allowAllView: false, defaultFloorId: "all" });

    render(<FloorMonitorPage allView />);

    const redirect = await screen.findByTestId("redirect");
    expect(redirect.getAttribute("data-to")).toContain("/fl_2f");
    expect(redirect.getAttribute("data-to")).not.toContain("/all");
  });
});
