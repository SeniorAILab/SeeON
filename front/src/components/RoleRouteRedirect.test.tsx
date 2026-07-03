import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoleRouteRedirect } from "./RoleRouteRedirect";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import type { User } from "@/types";

beforeEach(() => {
  useFacilityStore.setState({ currentFacilityId: null });
  setUser("SUPER_ADMIN", null);
});

describe("RoleRouteRedirect", () => {
  it.each([
    ["SUPER_ADMIN", null],
    ["ADMIN", "fac_happy_nokyang"],
    ["STAFF", "fac_happy_nokyang"],
  ] as const)("routes %s to /dashboard", async (role, facilityId) => {
    setUser(role, facilityId);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleRouteRedirect />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("dashboard")).toBeTruthy();
  });
});

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
