import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/services/db";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCK", undefined);
  localStorage.clear();
  db.users = db.users.filter((u) => u.id !== "u_kakao_mock");
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
  it("shows Kakao login without demo email login when VITE_USE_MOCK is unset", async () => {
    await renderRealModeLogin();

    expect(screen.getByRole("button", { name: "카카오 로그인" })).toBeTruthy();
    expect(screen.queryByText("데모 계정 (비밀번호 1234)")).toBeNull();
    expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
  });
});
