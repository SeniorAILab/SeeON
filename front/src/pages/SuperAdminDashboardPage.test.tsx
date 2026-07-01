import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuperAdminDashboardPage } from "./SuperAdminDashboardPage";
import { dashboardService } from "@/services/dashboardService";
import { useAuthStore } from "@/store/authStore";

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getDashboard: vi.fn(),
  },
}));

const getDashboard = vi.mocked(dashboardService.getDashboard);

beforeEach(() => {
  getDashboard.mockReset();
  useAuthStore.setState({
    user: {
      id: "user-super",
      name: "SeniorAILab Super Admin",
      email: "seniorsailab@gmail.com",
      role: "SUPER_ADMIN",
      facilityId: null,
    },
    initialized: true,
    loading: false,
    error: null,
    logout: vi.fn(),
  });
});

describe("SuperAdminDashboardPage", () => {
  it("shows read-model failures instead of rendering unavailable facilities as zero-count facilities", async () => {
    getDashboard.mockRejectedValue(new Error("dashboard read model unavailable"));

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(getDashboard).toHaveBeenCalled());
    expect(await screen.findAllByText("대시보드 연결 실패")).toHaveLength(2);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(6);
  });

  it("marks mismatched facility read models unavailable instead of showing zero metrics", async () => {
    getDashboard.mockResolvedValue({
      facility: {
        id: "wrong-facility",
        code: "wrong",
        name: "다른 요양원",
        address: "",
        phone: "",
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
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(getDashboard).toHaveBeenCalled());
    expect(await screen.findAllByText("대시보드 연결 실패")).toHaveLength(2);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(6);
  });
});
