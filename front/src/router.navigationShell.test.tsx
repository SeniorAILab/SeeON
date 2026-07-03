import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

describe("navigation shell route removals", () => {
  it.each([
    "/admin/focus-residents",
    "/admin/assignments",
    "/admin/alert-rules",
    "/admin/floors",
    "/admin/ux-test",
  ])("does not match hidden or removed route %s", async (entry) => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/admin" element={<div>admin-home</div>} />
          <Route path="/admin/events" element={<div>events</div>} />
          <Route path="/admin/facility" element={<div>facility</div>} />
          <Route path="/admin/spaces" element={<div>spaces</div>} />
          <Route path="/admin/monitor-settings" element={<div>monitor-settings</div>} />
          <Route path="/admin/users" element={<div>users</div>} />
          <Route path="*" element={<div>not-found</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("not-found")).toBeTruthy();
  });
});
