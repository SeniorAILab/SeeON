import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { SignupPage } from "./SignupPage";
import { useAuthStore } from "@/stores/authStore";

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    user: null,
    loading: false,
    error: null,
    initialized: true,
    login: vi.fn(),
    register: vi.fn(),
  });
});

function renderLogin(initialEntry = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/facilities" element={<div>DASHBOARD</div>} />
        <Route path="/facilities/:facilityId/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}
function fillValidSignupFields() {
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
}

function agreeToSignupConsent() {
  fireEvent.click(screen.getByRole("checkbox", { name: /서비스 이용약관/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집 및 이용/ }));
}


describe("LoginPage", () => {
  it("이메일 로그인 버튼과 회원가입 버튼을 함께 표시한다", () => {
    renderLogin();
    expect(screen.getByPlaceholderText("name@facility.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "이메일로 로그인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "회원가입" })).toBeTruthy();
    expect(screen.queryByLabelText("이름")).toBeNull();
    expect(screen.queryByText("데모 계정 (비밀번호 1234)")).toBeNull();
  });

  it("시설 관리자 이메일 로그인 성공 시 시설 관리자 대시보드로 이동한다", async () => {
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

    await waitFor(() => expect(screen.getByText("DASHBOARD")).toBeTruthy());
    expect(login).toHaveBeenCalledWith({
      email: "admin@sen.ai",
      password: "1234",
    });
  });

  it("슈퍼 관리자 이메일 로그인 성공 시 시스템 대시보드로 이동한다", async () => {
    const login = vi.fn().mockResolvedValue({
      id: "user-super",
      name: "SeniorAILab Super Admin",
      email: "seniorsailab@gmail.com",
      role: "SUPER_ADMIN",
      facilityId: null,
    });
    useAuthStore.setState({ login });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("name@facility.com"), {
      target: { value: "seniorsailab@gmail.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("비밀번호"), {
      target: { value: "seniorailab1@" },
    });
    fireEvent.click(screen.getByRole("button", { name: "이메일로 로그인" }));

    await waitFor(() => expect(screen.getByText("DASHBOARD")).toBeTruthy());
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
    fillValidSignupFields();
    agreeToSignupConsent();
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() => expect(screen.getByText("DASHBOARD")).toBeTruthy());
    expect(register).toHaveBeenCalledWith({
      name: "홍원장",
      email: "owner@example.test",
      password: "care2026",
      phone: "010-1111-2222",
      facilityName: "ULW 요양원",
    });
  });

  it("회원가입 화면에서 이용약관과 개인정보 동의 전에는 제출하지 않는다", () => {
    const register = vi.fn();
    useAuthStore.setState({ register });
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
    fillValidSignupFields();

    const submitButton = screen.getByRole("button", { name: "회원가입" });
    expect(submitButton).toHaveProperty("disabled", true);
    fireEvent.click(submitButton);
    expect(register).not.toHaveBeenCalled();
    expect(screen.queryByText("DASHBOARD")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /서비스 이용약관/ }));
    expect(submitButton).toHaveProperty("disabled", true);
    fireEvent.click(submitButton);
    expect(register).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집 및 이용/ }));
    expect(submitButton).toHaveProperty("disabled", false);
  });

  it("회원가입 화면에서 이용약관과 개인정보 동의 후 기존 성공 흐름으로 이동한다", async () => {
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
    fillValidSignupFields();
    agreeToSignupConsent();
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() => expect(screen.getByText("DASHBOARD")).toBeTruthy());
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
    agreeToSignupConsent();
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
    agreeToSignupConsent();
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
