import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./UsersPage";
import { useAuthStore } from "@/stores/authStore";
import { createUser, listUsers, updateUserRole } from "@/services/api/users";
import { ApiError } from "@/services/apiClient";

vi.mock("@/services/api/users", () => ({
  listUsers: vi.fn(async () => [
    { id: "user-1", name: "관리자", email: "admin@example.test", role: "ADMIN", facilityId: "fac-1" },
  ]),
  createUser: vi.fn(),
  updateUserRole: vi.fn(),
}));

const listUsersMock = vi.mocked(listUsers);
const createUserMock = vi.mocked(createUser);
const updateUserRoleMock = vi.mocked(updateUserRole);

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, initialized: true, loading: false, error: null });
  });

  it("renders backend users and account management controls", async () => {
    useAuthStore.setState({
      user: {
        id: "user-1",
        name: "관리자",
        email: "admin@example.test",
        role: "ADMIN",
        facilityId: "fac-1",
      },
    });

    render(<UsersPage />);

    expect(await screen.findByRole("heading", { name: "사용자" })).toBeTruthy();
    expect(listUsersMock).toHaveBeenCalled();
    expect(screen.getByText("관리자")).toBeTruthy();
    expect(screen.getByText("admin@example.test")).toBeTruthy();
    expect(screen.getByText("(나)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "생성" })).toBeTruthy();
  });

  it("creates a user from backend response shape and displays the initial password", async () => {
    createUserMock.mockResolvedValueOnce({
      user: { id: "user-2", name: "요양보호사", email: "staff@example.test", role: "STAFF", facilityId: null },
      initialPassword: "Tmp-1234",
    });

    render(<UsersPage />);

    const inputs = await screen.findAllByDisplayValue("");
    fireEvent.change(inputs[0], { target: { value: "요양보호사" } });
    fireEvent.change(inputs[1], { target: { value: "staff@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith({ name: "요양보호사", email: "staff@example.test", role: "STAFF" });
    });
    expect(await screen.findByText(/초기 비밀번호/)).toBeTruthy();
    expect(screen.getByText("Tmp-1234")).toBeTruthy();
  });

  it("submits role PATCH changes", async () => {
    updateUserRoleMock.mockResolvedValueOnce({
      id: "user-1",
      name: "관리자",
      email: "admin@example.test",
      role: "STAFF",
      facilityId: "fac-1",
    });

    render(<UsersPage />);

    fireEvent.change(await screen.findByLabelText("관리자 권한"), { target: { value: "STAFF" } });

    await waitFor(() => {
      expect(updateUserRoleMock).toHaveBeenCalledWith("user-1", "STAFF");
    });
  });
  it("409 API 오류는 원시 JSON 대신 사용자 생성 안내 문구로 표시한다", async () => {
    const rawError = JSON.stringify({
      message: "Email already registered",
      error: "Conflict",
      statusCode: 409,
    });
    createUserMock.mockRejectedValueOnce(new ApiError(409, rawError));
    render(<UsersPage />);

    const inputs = await screen.findAllByDisplayValue("");
    fireEvent.change(inputs[0], { target: { value: "요양보호사" } });
    fireEvent.change(inputs[1], { target: { value: "staff@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));

    expect(await screen.findByText("이미 사용 중인 이메일입니다.")).toBeTruthy();
    expect(screen.queryByText(rawError)).toBeNull();
  });
});
