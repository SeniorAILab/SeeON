import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  it("카카오 OAuth 로그인 버튼만 표시한다", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "카카오 로그인" })).toBeTruthy();
    expect(screen.queryByText("데모 계정 (비밀번호 1234)")).toBeNull();
    expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
  });

  it("카카오 버튼 클릭 시 백엔드 OAuth 시작 액션을 호출한다", () => {
    const kakaoLogin = vi.fn();
    useAuthStore.setState({ kakaoLogin });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));

    expect(kakaoLogin).toHaveBeenCalledTimes(1);
  });
});
