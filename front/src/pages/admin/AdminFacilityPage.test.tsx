import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFacilityPage } from "./AdminFacilityPage";
import { getFacility, updateFacility } from "@/services/api/facilities";

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
  updateFacility: vi.fn(),
}));

const getFacilityMock = vi.mocked(getFacility);
const updateFacilityMock = vi.mocked(updateFacility);

describe("AdminFacilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders editable facility fields without facility code", async () => {
    render(<AdminFacilityPage />);

    expect(await screen.findByRole("heading", { name: "시설 정보" })).toBeTruthy();
    expect(screen.getByDisplayValue("행복 요양원")).toBeTruthy();
    expect(screen.getByDisplayValue("서울시 중구")).toBeTruthy();
    expect(screen.getByDisplayValue("02-123-4567")).toBeTruthy();
    expect(screen.queryByText(/코드/)).toBeNull();
    expect(screen.getByRole("button", { name: /저장/ })).toBeTruthy();
    expect(updateFacilityMock).not.toHaveBeenCalled();
  });

  it("submits facility PATCH changes", async () => {
    updateFacilityMock.mockResolvedValueOnce({
      id: "facility-1",
      name: "행복 요양원 본관",
      code: "legacy-code",
      address: "서울시 종로구",
      phone: "02-999-0000",
    });

    render(<AdminFacilityPage />);

    fireEvent.change(await screen.findByDisplayValue("행복 요양원"), { target: { value: "행복 요양원 본관" } });
    fireEvent.change(screen.getByDisplayValue("서울시 중구"), { target: { value: "서울시 종로구" } });
    fireEvent.change(screen.getByDisplayValue("02-123-4567"), { target: { value: "02-999-0000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(updateFacilityMock).toHaveBeenCalledWith("facility-1", {
        name: "행복 요양원 본관",
        address: "서울시 종로구",
        phone: "02-999-0000",
      });
    });
  });

  it("shows the backend error when facility loading fails", async () => {
    getFacilityMock.mockRejectedValueOnce(new Error("Forbidden"));

    render(<AdminFacilityPage />);

    expect(await screen.findByText(/시설 정보를 불러오지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/Forbidden/)).toBeTruthy();
  });
});
