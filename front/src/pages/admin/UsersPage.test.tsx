import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { UsersPage } from "./UsersPage";
import { useAuthStore } from "@/store/authStore";

describe("UsersPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, initialized: true, loading: false, error: null });
  });

  it("renders only the current session user instead of a runtime mock user list", () => {
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

    expect(screen.getByRole("heading", { name: "사용자" })).toBeTruthy();
    expect(screen.getByText("관리자")).toBeTruthy();
    expect(screen.getByText("admin@example.test")).toBeTruthy();
    expect(screen.getByText("(나)")).toBeTruthy();
    expect(screen.getByText(/현재 세션 사용자만 표시합니다/)).toBeTruthy();
  });
});
