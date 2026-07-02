import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RoleRouteRedirect } from "./RoleRouteRedirect";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import type { User } from "@/types";

beforeEach(() => {
  useFacilityStore.setState({ currentFacilityId: null });
  setUser("SUPER_ADMIN", null);
});

describe("RoleRouteRedirect", () => {
  it("routes super admin to the system dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleRouteRedirect />} />
          <Route path="/dashboard" element={<div>system-dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("system-dashboard")).toBeTruthy();
  });

  it("routes facility admin to the facility dashboard workbench", async () => {
    setUser("ADMIN", "fac_happy_nokyang");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleRouteRedirect />} />
          <Route path="/dashboard/admin" element={<RouteProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("/dashboard/admin")).toBeTruthy();
  });

  it("routes staff to the facility staff workbench", async () => {
    setUser("STAFF", "fac_happy_nokyang");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleRouteRedirect />} />
          <Route path="/dashboard/staff" element={<RouteProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("/dashboard/staff")).toBeTruthy();
  });
});

function RouteProbe() {
  const location = useLocation();
  return <div>{location.pathname}</div>;
}

function setUser(role: User["role"], facilityId: string | null): void {
  useAuthStore.setState({
    user: {
      id: `u_${role}`,
      name: role,
      email: `${role.toLowerCase()}@example.test`,
      role,
      facilityId,
    },
    loading: false,
    error: null,
    initialized: true,
  });
}
