import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { useAuthStore } from "@/store/authStore";

beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: "u_staff",
      name: "이간호",
      email: "staff@sen.ai",
      role: "STAFF",
      facilityId: "fac_happy_nokyang",
    },
    loading: false,
    error: null,
    initialized: true,
  });
});

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={["/dashboard/facilities/fac_happy_nokyang/admin"]}>
      <Routes>
        <Route
          path="/dashboard/facilities/:facilityId/admin"
          element={
            <RequireAuth minRole="FACILITY_ADMIN">
              <div>ADMIN_DASHBOARD</div>
            </RequireAuth>
          }
        />
        <Route path="/access-denied" element={<div>ACCESS_DENIED_PAGE</div>} />
        <Route path="/dashboard" element={<div>WRONG_DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  it("요양 보호사가 관리자 경로로 접근하면 접근 거부 화면으로 보낸다", () => {
    renderAdminRoute();
    expect(screen.getByText("ACCESS_DENIED_PAGE")).toBeTruthy();
  });
});
