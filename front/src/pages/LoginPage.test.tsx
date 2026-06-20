import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";

beforeEach(() => {
  localStorage.clear();
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
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
});
