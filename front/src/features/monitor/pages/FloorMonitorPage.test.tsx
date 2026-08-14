import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FloorMonitorPage } from "./FloorMonitorPage";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import { useMonitorSettingsStore } from "@/features/monitor/stores/monitorSettingsStore";
import { useUiStore } from "@/stores/uiStore";
import { dashboardService } from "@/services/dashboardService";

const useTTSAlertsMock = vi.fn();
const roomStatusBoardMock = vi.fn((_props: unknown) => <div />);
const monitorHeaderMock = vi.fn((_props: unknown) => <div />);
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
vi.mock("@/features/monitor/components/MonitorHeader", () => ({
  MonitorHeader: (props: unknown) => monitorHeaderMock(props),
}));
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
      cardSize: "xl",
      visibleSpaceIds: null,
      allowAllView: true,
    });
    vi.mocked(dashboardService.getDashboard).mockResolvedValue({
      facility: { id: facilityId, name: "행복요양원", address: "의정부시", phone: "031" },
      floors: [{ id: "fl_2f", facilityId, name: "2F", orderIndex: 2, provisioningSource: "PRODUCT" }],
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
  it("inherits html appearance instead of a board-local dark class", async () => {
    useUiStore.getState().setTheme("dark");

    const { container } = render(<FloorMonitorPage />);

    await waitFor(() => expect(monitorHeaderMock).toHaveBeenCalled());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(container.firstElementChild?.classList.contains("dark")).toBe(false);
  });
  it("keeps individual floor navigation when all-floor viewing is disabled", async () => {
    useMonitorSettingsStore.setState({ allowAllView: false });

    render(<FloorMonitorPage />);

    await waitFor(() => expect(monitorHeaderMock).toHaveBeenCalled());
    expect(monitorHeaderMock.mock.calls.at(-1)?.[0]).toMatchObject({
      floors: [{ id: "fl_2f" }],
      showAllView: false,
    });
  });
});

describe("FloorMonitorPage — initial-load-error", () => {
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
      cardSize: "xl",
      allowAllView: true,
      visibleSpaceIds: null,
    });
  });

  it("초기 조회가 실패하면 무한 로딩 대신 에러 문구와 재시도 버튼을 보여준다", async () => {
    vi.mocked(dashboardService.getDashboard).mockRejectedValue(new Error("500"));

    render(<FloorMonitorPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("안전 현황을 불러오지 못했습니다.");
    expect(alert.textContent).toContain("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
    expect(screen.getByRole("button", { name: "다시 시도" })).not.toBeNull();
    // 무한 로딩 문구는 더 이상 남아 있지 않다.
    expect(screen.queryByText("현황판을 준비하는 중...")).toBeNull();
  });

  it("다시 시도를 누르면 재조회하고 성공 시 현황판으로 넘어간다", async () => {
    vi.mocked(dashboardService.getDashboard)
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValueOnce({
        facility: { id: facilityId, name: "행복한요양원 녹양역점", address: "", phone: "" },
        floors: [{ id: "fl_2f", facilityId, name: "2F", orderIndex: 2, isActive: true }],
        spaces: [],
        statuses: {},
        summary: { totalSpaces: 0, stable: 0, caution: 0, danger: 0, checkNeeded: 0, unacknowledged: 0 },
        unacknowledgedEvents: [],
      } as never);

    render(<FloorMonitorPage />);

    const retry = await screen.findByRole("button", { name: "다시 시도" });
    fireEvent.click(retry);

    await waitFor(() => expect(roomStatusBoardMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
