import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

async function renderRealModeLogin() {
  const { LoginPage } = await import("./LoginPage");

  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LoginPage real backend default", () => {
  it("shows backend email login and Kakao login", async () => {
    await renderRealModeLogin();

    expect(screen.getByRole("button", { name: "카카오 로그인" })).toBeTruthy();
    expect(screen.getByPlaceholderText("name@facility.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "이메일로 로그인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "회원가입" })).toBeTruthy();
    expect(screen.queryByText("데모 계정 (비밀번호 1234)")).toBeNull();
  });
});
