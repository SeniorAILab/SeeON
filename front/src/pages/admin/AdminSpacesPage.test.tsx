import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSpacesPage } from "./AdminSpacesPage";
import { createFloor, deleteFloor, listFloors, updateFloor } from "@/services/api/floors";
import { createSpace, deleteSpace, listSpaces, updateSpace } from "@/services/api/spaces";
import { ApiError } from "@/services/apiClient";

vi.mock("@/services/api/floors", () => ({
  createFloor: vi.fn(),
  deleteFloor: vi.fn(),
  listFloors: vi.fn(),
  updateFloor: vi.fn(),
}));

vi.mock("@/services/api/spaces", () => ({
  createSpace: vi.fn(),
  deleteSpace: vi.fn(),
  listSpaces: vi.fn(),
  updateSpace: vi.fn(),
}));

const listFloorsMock = vi.mocked(listFloors);
const listSpacesMock = vi.mocked(listSpaces);
const createSpaceMock = vi.mocked(createSpace);
const updateSpaceMock = vi.mocked(updateSpace);
const deleteSpaceMock = vi.mocked(deleteSpace);
const deleteFloorMock = vi.mocked(deleteFloor);
const createFloorMock = vi.mocked(createFloor);
const updateFloorMock = vi.mocked(updateFloor);

describe("AdminSpacesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFloorsMock.mockResolvedValue([
      { id: "fl_2", facilityId: "fac_1", name: "2F", orderIndex: 2, provisioningSource: "PRODUCT" },
    ]);
    listSpacesMock.mockResolvedValue([
      {
        id: "sp_201",
        facilityId: "fac_1",
        floorId: "fl_2",
        name: "201호",
        type: "ROOM",
        capacity: 4,
        isActive: true,
        provisioningSource: "PRODUCT",
      },
    ]);
  });

  it("renders integrated space management without removed capacity/type/staff fields", async () => {
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByText("201호")).toBeTruthy());

    expect(screen.getByText("공간 관리")).toBeTruthy();
    expect(screen.getAllByText("대시보드 표시").length).toBeGreaterThan(0);
    expect(screen.queryByText(/정원|공간 유형|담당/)).toBeNull();
  });

  it("creates spaces with UI-hidden transitional type and capacity defaults", async () => {
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByText("201호")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "공간 추가" }));
    fireEvent.change(screen.getByPlaceholderText("예: 204호"), { target: { value: "202호" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(createSpaceMock).toHaveBeenCalledWith({
        floorId: "fl_2",
        name: "202호",
        isActive: true,
        type: "ROOM",
        capacity: 1,
      })
    );
  });

  it("updates spaces with only name, floor, and active fields", async () => {
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByText("201호")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "201호 수정" }));
    fireEvent.change(screen.getByPlaceholderText("예: 204호"), { target: { value: "201호 A" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(updateSpaceMock).toHaveBeenCalledWith("sp_201", {
        floorId: "fl_2",
        name: "201호 A",
        isActive: true,
      })
    );
    expect(updateSpaceMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: expect.anything(), capacity: expect.anything() })
    );
  });
  it("hides spaces in place and restores hidden spaces instead of offering a dead delete action", async () => {
    deleteSpaceMock.mockResolvedValue(undefined as never);
    updateSpaceMock.mockResolvedValue(undefined as never);
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByText("201호")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "201호 숨김" }));

    await waitFor(() => expect(screen.getByText("숨김")).toBeTruthy());
    expect(screen.getByRole("button", { name: "201호 복원" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "201호 숨김" })).toBeNull();
    expect(screen.getByText("201호 공간을 숨겼습니다.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "201호 복원" }));
    await waitFor(() => expect(updateSpaceMock).toHaveBeenCalledWith("sp_201", { isActive: true }));
    expect(screen.getByText("201호 공간을 복원했습니다.")).toBeTruthy();
  });

  it("shows a friendly error when adding a floor fails", async () => {
    createFloorMock.mockRejectedValue(
      new ApiError(409, JSON.stringify({ message: "같은 이름의 층이 이미 존재합니다." }))
    );
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByText("201호")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("새 층 이름 (예: 5F)"), { target: { value: "2F" } });
    fireEvent.click(screen.getByRole("button", { name: "층 추가" }));

    await waitFor(() =>
      expect(screen.getByText("같은 이름의 층이 이미 존재합니다.")).toBeTruthy()
    );
    expect(screen.queryByText(/"message"/)).toBeNull();
  });

  it("shows a fallback error when saving a floor fails", async () => {
    updateFloorMock.mockRejectedValue(new ApiError(400, "invalid validation response"));
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "2F 이름 수정" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "2F 이름 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "층 이름 저장" }));

    await waitFor(() =>
      expect(screen.getByText("층 이름을 저장할 수 없습니다. 다시 시도하세요.")).toBeTruthy()
    );
    expect(screen.queryByText("invalid validation response")).toBeNull();
  });

  it("shows the active-space conflict returned by the backend when floor deletion fails", async () => {
    deleteFloorMock.mockRejectedValue(
      new ApiError(409, JSON.stringify({ message: "Floor cannot be deleted while active spaces reference it" }))
    );
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "2F 삭제" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "2F 삭제" }));

    await waitFor(() =>
      expect(screen.getByText("Floor cannot be deleted while active spaces reference it")).toBeTruthy()
    );
  });

  it("shows the referenced-hidden-space conflict returned by the backend when floor deletion fails", async () => {
    deleteFloorMock.mockRejectedValue(
      new ApiError(409, JSON.stringify({ message: "참조 이력이 있는 공간이 포함된 층은 삭제할 수 없습니다" }))
    );
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "2F 삭제" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "2F 삭제" }));

    await waitFor(() =>
      expect(screen.getByText("참조 이력이 있는 공간이 포함된 층은 삭제할 수 없습니다")).toBeTruthy()
    );
  });

  it("locks EDGE-owned floor rows: badge instead of edit/delete controls", async () => {
    listFloorsMock.mockResolvedValue([
      { id: "fl_2", facilityId: "fac_1", name: "2F", orderIndex: 2, provisioningSource: "PRODUCT" },
      { id: "fl_3", facilityId: "fac_1", name: "3F", orderIndex: 3, provisioningSource: "EDGE" },
    ]);
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByText("3F")).toBeTruthy());

    expect(screen.getByText("현장 Edge에서 관리됨")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "3F 이름 수정" })).toBeNull();
    expect(screen.queryByRole("button", { name: "3F 삭제" })).toBeNull();
    // PRODUCT row is unaffected.
    expect(screen.getByRole("button", { name: "2F 이름 수정" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2F 삭제" })).toBeTruthy();
  });

  it("locks EDGE-owned space rows: badge instead of edit/hide/restore controls", async () => {
    listSpacesMock.mockResolvedValue([
      {
        id: "sp_201",
        facilityId: "fac_1",
        floorId: "fl_2",
        name: "201호",
        type: "ROOM",
        capacity: 4,
        isActive: true,
        provisioningSource: "PRODUCT",
      },
      {
        id: "sp_202",
        facilityId: "fac_1",
        floorId: "fl_2",
        name: "202호",
        type: "ROOM",
        capacity: 4,
        isActive: true,
        provisioningSource: "EDGE",
      },
    ]);
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByText("202호")).toBeTruthy());

    expect(screen.getByText("현장 Edge에서 관리됨")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "202호 수정" })).toBeNull();
    expect(screen.queryByRole("button", { name: "202호 숨김" })).toBeNull();
    expect(screen.queryByRole("button", { name: "202호 복원" })).toBeNull();
    // PRODUCT row is unaffected.
    expect(screen.getByRole("button", { name: "201호 수정" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "201호 숨김" })).toBeTruthy();
  });

  it("gives the floor edit controls accessible names", async () => {
    render(<AdminSpacesPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "2F 이름 수정" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "2F 이름 수정" }));

    expect(screen.getByRole("textbox", { name: "2F 층 이름 편집" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "층 이름 저장" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "수정 취소" })).toBeTruthy();
  });
});
