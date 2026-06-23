import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { useAuthStore } from "@/store/authStore";

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    user: null,
    loading: false,
    error: null,
    initialized: true,
    login: vi.fn(),
    kakaoLogin: vi.fn(),
  });
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/now" element={<div>NOW_PAGE</div>} />
        <Route path="/admin/dashboard" element={<div>ADMIN_DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  it("백엔드 이메일 로그인과 카카오 OAuth를 함께 표시한다", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "카카오 로그인" })).toBeTruthy();
    expect(screen.getByPlaceholderText("name@facility.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "이메일로 로그인" })).toBeTruthy();
    expect(screen.queryByText("데모 계정 (비밀번호 1234)")).toBeNull();
  });

  it("카카오 버튼 클릭 시 백엔드 OAuth 시작 액션을 호출한다", () => {
    const kakaoLogin = vi.fn();
    useAuthStore.setState({ kakaoLogin });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));

    expect(kakaoLogin).toHaveBeenCalledTimes(1);
  });

  it("이메일 로그인 성공 시 사용자 기본 경로로 이동한다", async () => {
    const login = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "시설 관리자",
      email: "admin@sen.ai",
      role: "FACILITY_ADMIN",
      facilityId: "facility-1",
    });
    useAuthStore.setState({ login });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("name@facility.com"), {
      target: { value: "admin@sen.ai" },
    });
    fireEvent.change(screen.getByPlaceholderText("비밀번호"), {
      target: { value: "1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "이메일로 로그인" }));

    await waitFor(() => expect(screen.getByText("ADMIN_DASHBOARD")).toBeTruthy());
    expect(login).toHaveBeenCalledWith({
      email: "admin@sen.ai",
      password: "1234",
    });
  });
});
