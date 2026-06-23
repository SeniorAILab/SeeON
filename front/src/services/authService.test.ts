import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authService, mapBackendRoleToFrontRole } from "./authService";
import { db } from "./db";
import { facilities as seedFacilities } from "@/data/mockData";

const KAKAO_ID = "u_kakao_mock";
const MARKER_KEY = "senai.kakaoMockIdentity";

beforeEach(() => {
  localStorage.clear();
  db.users = db.users.filter((u) => u.id !== KAKAO_ID);
  // 시설 시드 복구(이전 테스트가 비웠을 수 있음).
  if (db.facilities.length === 0) db.facilities = JSON.parse(JSON.stringify(seedFacilities));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authService.kakaoLogin (mock)", () => {
  it("첫 클릭은 가입: 신규 mock 카카오 사용자를 FACILITY_ADMIN/데모 시설로 생성한다", async () => {
    const session = await authService.kakaoLogin();
    expect(session.user.id).toBe(KAKAO_ID);
    expect(session.user.name).toBe("카카오 원장");
    expect(session.user.role).toBe("FACILITY_ADMIN");
    expect(session.user.facilityId).toBe("fac_happy_nokyang");
    // 세션 사용자에는 password 가 노출되지 않는다.
    expect("password" in session.user).toBe(false);
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
    expect(localStorage.getItem("senai.session")).toBeTruthy();
  });

  it("재클릭은 로그인: db.users 중복 없이 동일 사용자 반환", async () => {
    const first = await authService.kakaoLogin();
    const second = await authService.kakaoLogin();
    expect(second.user.id).toBe(first.user.id);
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
  });

  it("로그아웃 후 재클릭해도 가입이 반복되지 않는다(marker 유지)", async () => {
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

  it("restore 는 저장된 카카오 세션을 복원하고, 비워진 db.users 를 재구성한다", async () => {
    await authService.kakaoLogin();
    // reload 로 인메모리 db 가 초기화된 상황을 모사
    db.users = db.users.filter((u) => u.id !== KAKAO_ID);
    const restored = authService.restore();
    expect(restored?.user.id).toBe(KAKAO_ID);
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
  });

  it("이메일/비번 로그인은 카카오 mock 사용자를 매칭하지 않는다(우회 차단)", async () => {
    await authService.kakaoLogin(); // db 에 카카오 사용자 존재
    await expect(
      authService.login("kakao.mock@sen.ai", "__kakao_oauth_no_password__")
    ).rejects.toThrow();
  });

  it("USE_MOCK=false 에서는 이메일/비번 mock 로그인을 차단한다", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    vi.resetModules();

    const { authService: realModeAuthService } = await import("./authService");

    await expect(realModeAuthService.login("staff@sen.ai", "1234")).rejects.toThrow(
      /카카오 로그인/
    );
  });

  it("바인딩 시설이 db 에 없으면 명시적으로 실패한다", async () => {
    const saved = db.facilities;
    db.facilities = [];
    await expect(authService.kakaoLogin()).rejects.toThrow(/시설/);
    db.facilities = saved;
  });

  it("손상된 marker 여도 로그인에 성공하고 중복을 만들지 않는다", async () => {
    localStorage.setItem(MARKER_KEY, "{ this is not valid json");
    const session = await authService.kakaoLogin();
    expect(session.user.id).toBe(KAKAO_ID);
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
  });

  it("변조된 카카오 세션을 복원하면 권위 상수로 canonicalize 한다", async () => {
    // 변조된 senai.session: 권한 상승 + 이름 위조
    localStorage.setItem(
      "senai.session",
      JSON.stringify({
        user: { id: KAKAO_ID, name: "해커", email: "x@x", role: "SUPER_ADMIN", facilityId: "elsewhere" },
        token: "mock-token-u_kakao_mock",
      })
    );
    const restored = authService.restore();
    expect(restored?.user.role).toBe("FACILITY_ADMIN");
    expect(restored?.user.name).toBe("카카오 원장");
    expect(restored?.user.facilityId).toBe("fac_happy_nokyang");
    expect(db.users.filter((u) => u.id === KAKAO_ID)).toHaveLength(1);
  });

  it("재구성 불가(시설 없음)면 stale 카카오 세션을 폐기한다", async () => {
    await authService.kakaoLogin();
    const saved = db.facilities;
    db.facilities = [];
    const restored = authService.restore();
    expect(restored).toBeNull();
    expect(localStorage.getItem("senai.session")).toBeNull();
    db.facilities = saved;
  });
});


describe("mapBackendRoleToFrontRole", () => {
  it("maps backend RBAC roles without exposing CAREGIVER as facility admin", () => {
    expect(mapBackendRoleToFrontRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    expect(mapBackendRoleToFrontRole("ADMIN")).toBe("FACILITY_ADMIN");
    expect(mapBackendRoleToFrontRole("CAREGIVER")).toBe("STAFF");
  });
});
