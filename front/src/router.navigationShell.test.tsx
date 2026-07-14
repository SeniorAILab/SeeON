import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
const SCOPED_FACILITY_ID = "fac_happy_nokyang";


describe("navigation shell route removals", () => {
  it.each([
    `/facilities/${SCOPED_FACILITY_ID}/admin/focus-residents`,
    `/facilities/${SCOPED_FACILITY_ID}/admin/assignments`,
    `/facilities/${SCOPED_FACILITY_ID}/admin/alert-rules`,
    `/facilities/${SCOPED_FACILITY_ID}/admin/floors`,
    `/facilities/${SCOPED_FACILITY_ID}/admin/ux-test`,
  ])("does not match hidden or removed route %s", async (entry) => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/facilities/:facilityId/admin" element={<div>admin-home</div>} />
          <Route path="/facilities/:facilityId/admin/events" element={<div>events</div>} />
          <Route path="/facilities/:facilityId/admin/facility" element={<div>facility</div>} />
          <Route path="/facilities/:facilityId/admin/spaces" element={<div>spaces</div>} />
          <Route path="/facilities/:facilityId/admin/monitor-settings" element={<div>monitor-settings</div>} />
          <Route path="/facilities/:facilityId/admin/users" element={<div>users</div>} />
          <Route path="*" element={<div>not-found</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("not-found")).toBeTruthy();
  });
});
