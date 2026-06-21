import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";
import { db } from "@/services/db";

beforeEach(() => {
  localStorage.clear();
  db.users = db.users.filter((u) => u.id !== "u_kakao_mock");
  useAuthStore.setState({ user: null, loading: false, error: null, initialized: false });
});

describe("authStore.kakaoLogin", () => {
  it("성공 시 user 를 설정하고 loading 을 해제한다", async () => {
    const user = await useAuthStore.getState().kakaoLogin();
    expect(user.id).toBe("u_kakao_mock");
    expect(useAuthStore.getState().user?.id).toBe("u_kakao_mock");
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });
});
