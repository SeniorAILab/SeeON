import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { SignupPage } from "./SignupPage";
import { useAuthStore } from "@/store/authStore";

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    user: null,
    loading: false,
    error: null,
    initialized: true,
    login: vi.fn(),
    register: vi.fn(),
    kakaoLogin: vi.fn(),
  });
});

function renderLogin(initialEntry = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
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
    expect(screen.getByRole("button", { name: "회원가입" })).toBeTruthy();
    expect(screen.queryByLabelText("이름")).toBeNull();
    expect(screen.queryByText("데모 계정 (비밀번호 1234)")).toBeNull();
  });

  it("카카오 버튼 클릭 시 백엔드 OAuth 시작 액션을 호출한다", () => {
    const kakaoLogin = vi.fn();
    useAuthStore.setState({ kakaoLogin });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));

    expect(kakaoLogin).toHaveBeenCalledTimes(1);
  });

  it("카카오 사용 불가 리다이렉트는 사용자용 일반 메시지를 표시한다", () => {
    renderLogin("/login?auth_error=kakao_unavailable");

    expect(
      screen.getByText("카카오 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.")
    ).toBeTruthy();
  });

  it("기존 카카오 설정 오류 코드도 사용자용 일반 메시지를 표시한다", () => {
    renderLogin("/login?auth_error=kakao_config");

    expect(
      screen.getByText("카카오 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.")
    ).toBeTruthy();
  });

  it("미등록 카카오 계정은 회원가입과 관리자 등록 요청을 안내한다", () => {
    renderLogin("/login?auth_error=kakao_unregistered");

    expect(
      screen.getByText(
        "등록된 카카오 계정이 없습니다. 원장님은 회원가입을 진행하고, 직원은 관리자에게 계정 등록을 요청해 주세요."
      )
    ).toBeTruthy();
  });

  it("이메일 로그인 성공 시 사용자 기본 경로로 이동한다", async () => {
    const login = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "관리자",
      email: "admin@sen.ai",
      role: "ADMIN",
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

  it("회원가입 버튼 클릭 시 회원가입 폼 화면으로 이동한다", () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    expect(screen.getByRole("heading", { name: "회원가입" })).toBeTruthy();
    expect(screen.getByLabelText("이름")).toBeTruthy();
    expect(screen.getByLabelText("전화번호")).toBeTruthy();
    expect(screen.getByLabelText("요양원")).toBeTruthy();
  });

  it("회원가입 화면에서 이름, 전화번호, 요양원 이름을 제출한다", async () => {
    const register = vi.fn().mockResolvedValue({
      id: "user-1",
      name: "홍원장",
      email: "owner@example.test",
      role: "ADMIN",
      facilityId: "facility-1",
    });
    useAuthStore.setState({ register });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: "홍원장" },
    });
    fireEvent.change(screen.getByPlaceholderText("name@facility.com"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "care2026" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
      target: { value: "care2026" },
    });
    fireEvent.change(screen.getByLabelText("전화번호"), {
      target: { value: "010-1111-2222" },
    });
    fireEvent.change(screen.getByLabelText("요양원"), {
      target: { value: "ULW 요양원" },
    });
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() => expect(screen.getByText("ADMIN_DASHBOARD")).toBeTruthy());
    expect(register).toHaveBeenCalledWith({
      name: "홍원장",
      email: "owner@example.test",
      password: "care2026",
      phone: "010-1111-2222",
      facilityName: "ULW 요양원",
    });
  });

  it("회원가입 화면에서 짧은 비밀번호를 서버 호출 전에 막는다", async () => {
    const register = vi.fn();
    useAuthStore.setState({ register });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: "홍원장" },
    });
    fireEvent.change(screen.getByPlaceholderText("name@facility.com"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("전화번호"), {
      target: { value: "010-1111-2222" },
    });
    fireEvent.change(screen.getByLabelText("요양원"), {
      target: { value: "ULW 요양원" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "1234567" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
      target: { value: "1234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    expect(
      await screen.findByText("비밀번호는 8자 이상이어야 합니다.")
    ).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it("회원가입 화면에서 비밀번호 확인이 다르면 서버 호출 전에 막는다", async () => {
    const register = vi.fn();
    useAuthStore.setState({ register });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: "홍원장" },
    });
    fireEvent.change(screen.getByPlaceholderText("name@facility.com"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("전화번호"), {
      target: { value: "010-1111-2222" },
    });
    fireEvent.change(screen.getByLabelText("요양원"), {
      target: { value: "ULW 요양원" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "care2026" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
      target: { value: "diff2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    expect(await screen.findByText("비밀번호가 일치하지 않습니다.")).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it("회원가입 비밀번호 입력은 보기/숨기기 토글을 제공한다", () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
    const passwordInput = screen.getByLabelText("비밀번호");
    const passwordConfirmInput = screen.getByLabelText("비밀번호 확인");

    expect(passwordInput.getAttribute("type")).toBe("password");
    expect(passwordConfirmInput.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(passwordInput.getAttribute("type")).toBe("text");
    expect(passwordConfirmInput.getAttribute("type")).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 숨기기" }));
    expect(passwordInput.getAttribute("type")).toBe("password");
    expect(passwordConfirmInput.getAttribute("type")).toBe("password");
  });
});
