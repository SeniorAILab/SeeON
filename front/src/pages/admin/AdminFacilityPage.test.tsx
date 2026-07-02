import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFacilityPage } from "./AdminFacilityPage";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const facility = {
  id: "fac_happy_nokyang",
  name: "행복한요양원 녹양역점",
  code: "happy-nokyang",
  address: "경기도 의정부시",
  phone: "031-856-8090",
};

describe("AdminFacilityPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("edits the current facility profile without exposing the facility code", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/facilities/current") && init?.method === "PATCH") {
        expect(init.body).toBe(
          JSON.stringify({
            name: "행복한요양원 녹양역점",
            address: "경기도 의정부시 행복로 10",
            phone: "031-856-8090",
          })
        );
        return okJsonResponse({
          ...facility,
          address: "경기도 의정부시 행복로 10",
        });
      }
      if (url.endsWith("/facilities/current")) return okJsonResponse(facility);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminFacilityPage />);

    expect(await screen.findByDisplayValue("행복한요양원 녹양역점")).toBeTruthy();
    expect(screen.queryByText("시설 코드")).toBeNull();
    expect(screen.queryByDisplayValue("happy-nokyang")).toBeNull();

    fireEvent.change(screen.getByDisplayValue("경기도 의정부시"), {
      target: { value: "경기도 의정부시 행복로 10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await screen.findByText("저장되었습니다.");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/facilities/current",
        expect.objectContaining({
          method: "PATCH",
        })
      );
    });
  });
});
