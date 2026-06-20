import { describe, it, expect, beforeEach, vi } from "vitest";
import { authService } from "./authService";
import { db } from "./db";

const KAKAO_ID = "u_kakao_mock";

beforeEach(() => {
  localStorage.clear();
  db.users = db.users.filter((u) => u.id !== KAKAO_ID);
});

describe("authService.kakaoLogin (mock)", () => {
  it("첫 클릭은 가입: 신규 mock 카카오 사용자를 FACILITY_ADMIN/데모 시설로 생성한다", async () => {
    const session = await authService.kakaoLogin();
    expect(session.user.id).toBe(KAKAO_ID);
    expect(session.user.name).toBe("카카오 원장");
    expect(session.user.role).toBe("FACILITY_ADMIN");
    expect(session.user.facilityId).toBe("fac_happy_nokyang");
    // 세션 사용자에는 password 가 노출되지 않는다.
    expect((session.user as { password?: string }).password).toBeUndefined();
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
    expect(localStorage.getItem("senai.session")).toBeTruthy();
  });

  it("재클릭은 로그인: db.users 중복 없이 동일 사용자 반환", async () => {
    const first = await authService.kakaoLogin();
    const second = await authService.kakaoLogin();
    expect(second.user.id).toBe(first.user.id);
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
  });

  it("로그아웃 후 재클릭해도 가입이 반복되지 않는다(identity marker 유지)", async () => {
    await authService.kakaoLogin();
    await authService.logout();
    await authService.kakaoLogin();
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
  });

  it("USE_MOCK 경로에서 네트워크 호출이 없다", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await authService.kakaoLogin();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("restore 는 저장된 카카오 세션을 복원한다", async () => {
    await authService.kakaoLogin();
    const restored = authService.restore();
    expect(restored?.user.id).toBe(KAKAO_ID);
  });

  it("이메일/비번 로그인은 카카오 mock 사용자를 매칭하지 않는다(우회 차단)", async () => {
    await authService.kakaoLogin(); // db 에 카카오 사용자 존재
    await expect(
      authService.login("kakao.mock@sen.ai", "__kakao_oauth_no_password__")
    ).rejects.toThrow();
  });
});
