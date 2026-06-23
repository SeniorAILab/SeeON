import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { db } from "@/services/db";

beforeEach(() => {
  localStorage.clear();
  db.users = db.users.filter((u) => u.id !== "u_kakao_mock");
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
  it("카드 최상단에 카카오 로그인 버튼을 표시한다", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "카카오 로그인" })).toBeTruthy();
  });

  it("기존 이메일/비밀번호 폼과 데모 계정을 그대로 유지한다", () => {
    renderLogin();
    expect(screen.getByText("이메일")).toBeTruthy();
    expect(screen.getByText("비밀번호")).toBeTruthy();
    expect(screen.getByText("데모 계정 (비밀번호 1234)")).toBeTruthy();
    expect(screen.getByText("admin@sen.ai")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
  });

  it("카카오 버튼 클릭 시 가입/로그인 후 관리자 대시보드로 이동한다", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));
    expect(await screen.findByText("ADMIN_DASHBOARD")).toBeTruthy();
    expect(db.users.filter((u) => u.id === "u_kakao_mock")).toHaveLength(1);
  });

  it("시설 관리자 로그인 후 관리자 대시보드로 이동한다", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: /시설 관리자/ }));
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByText("ADMIN_DASHBOARD")).toBeTruthy();
  });

  it("케어 직원 로그인 후 직원 홈으로 이동한다", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: /케어 직원/ }));
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByText("NOW_PAGE")).toBeTruthy();
  });
});
