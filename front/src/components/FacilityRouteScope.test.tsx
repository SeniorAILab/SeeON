import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, it } from "vitest";
import { FacilityRouteScope } from "@/components/FacilityRouteScope";
import { useAuthStore } from "@/store/authStore";
import { getCurrentFacilityId, useFacilityStore } from "@/store/facilityStore";

function ScopedProbe() {
  const facilityId = getCurrentFacilityId();
  if (facilityId !== "fac_happy_nokyang") {
    throw new Error(`child rendered before facility scope: ${facilityId ?? "null"}`);
  }
  return <div>Scoped {facilityId}</div>;
}

describe("FacilityRouteScope", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: "super-admin",
        name: "Senior AI Lab",
        email: "seniorsailab@gmail.com",
        role: "SUPER_ADMIN",
        facilityId: null,
      },
    });
    useFacilityStore.setState({ currentFacilityId: null, facilities: [] });
  });

  it("waits to render children until the route facility is active in the store", async () => {
    render(
      <MemoryRouter
        initialEntries={["/dashboard/facilities/fac_happy_nokyang/admin"]}
      >
        <Routes>
          <Route
            path="/dashboard/facilities/:facilityId/admin"
            element={
              <FacilityRouteScope>
                <ScopedProbe />
              </FacilityRouteScope>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Scoped fac_happy_nokyang");
  });
});
