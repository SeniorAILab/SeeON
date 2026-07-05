import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoleRouteRedirect } from "./RoleRouteRedirect";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import type { User } from "@/types";

beforeEach(() => {
  useFacilityStore.setState({ currentFacilityId: null });
  setUser("SUPER_ADMIN", null);
});

describe("RoleRouteRedirect", () => {
  it.each([
    ["SUPER_ADMIN", null, "/facilities", "picker"],
    ["SUPER_ADMIN", "fac_happy_nokyang", "/facilities", "picker"],
    ["ADMIN", "fac_happy_nokyang", "/facilities/fac_happy_nokyang/dashboard", "dashboard"],
    ["STAFF", "fac_happy_nokyang", "/facilities/fac_happy_nokyang/floors", "floors"],
    ["ADMIN", null, "/onboarding", "onboarding"],
    ["STAFF", null, "/access-denied", "denied"],
  ] as const)("routes %s with facility %s to %s", async (role, facilityId, _path, label) => {
    setUser(role, facilityId);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleRouteRedirect />} />
          <Route path="/facilities" element={<div>picker</div>} />
          <Route path="/facilities/:facilityId/dashboard" element={<div>dashboard</div>} />
          <Route path="/facilities/:facilityId/floors" element={<div>floors</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
          <Route path="/access-denied" element={<div>denied</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(label)).toBeTruthy();
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
