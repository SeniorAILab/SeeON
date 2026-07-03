import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingPage } from "./OnboardingPage";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({
    user: {
      id: "user-1",
      name: "원장",
      email: "",
      role: "ADMIN",
      facilityId: null,
    },
    initialized: true,
    loading: false,
    error: null,
  });
  useFacilityStore.setState({ currentFacilityId: null });
});

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login" element={<div>LOGIN_PAGE</div>} />
        <Route path="/dashboard" element={<div>ADMIN_DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("OnboardingPage", () => {
  it("creates the facility through the backend and enters the app", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        okJsonResponse({
          user: {
            id: "user-1",
            nickname: "원장",
            role: "ADMIN",
            facilityId: "facility-1",
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    renderOnboarding();

    fireEvent.change(screen.getByPlaceholderText("예: 늘봄 요양원"), {
      target: { value: "Happy Care Home" },
    });
    fireEvent.click(screen.getByRole("button", { name: "시설 등록" }));

    await waitFor(() => expect(screen.getByText("ADMIN_DASHBOARD")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/facilities",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          facilityName: "Happy Care Home",
        }),
      })
    );
  });

  it("sends unauthenticated users back to login", () => {
    useAuthStore.setState({ user: null, initialized: true });

    renderOnboarding();

    expect(screen.getByText("LOGIN_PAGE")).toBeTruthy();
  });
});
