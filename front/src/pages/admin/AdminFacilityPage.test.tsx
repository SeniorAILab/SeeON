import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFacilityPage } from "./AdminFacilityPage";
import { getFacility } from "@/services/api/facilities";

vi.mock("@/hooks/useActiveFacilityId", () => ({
  useActiveFacilityId: () => "facility-1",
}));

vi.mock("@/services/api/facilities", () => ({
  getFacility: vi.fn(async () => ({
    id: "facility-1",
    name: "행복 요양원",
    code: "legacy-code",
    address: "서울시 중구",
    phone: "02-123-4567",
  })),
}));

const getFacilityMock = vi.mocked(getFacility);
describe("AdminFacilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders facility information as read-only without facility code or save controls", async () => {
    render(<AdminFacilityPage />);

    expect(await screen.findByRole("heading", { name: "시설 정보" })).toBeTruthy();
    expect(screen.getByDisplayValue("행복 요양원").hasAttribute("readonly")).toBe(true);
    expect(screen.getByDisplayValue("서울시 중구").hasAttribute("readonly")).toBe(true);
    expect(screen.getByDisplayValue("02-123-4567").hasAttribute("readonly")).toBe(true);
    expect(screen.queryByText(/코드/)).toBeNull();
    expect(screen.queryByRole("button", { name: /저장/ })).toBeNull();
  });

  it("shows the backend error when facility loading fails", async () => {
    getFacilityMock.mockRejectedValueOnce(new Error("Forbidden"));

    render(<AdminFacilityPage />);

    expect(await screen.findByText(/시설 정보를 불러오지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/Forbidden/)).toBeTruthy();
  });
});
