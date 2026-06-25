import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./authStore";

const authServiceMock = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  createFacility: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  startKakaoLogin: vi.fn(),
}));

vi.mock("@/services/authService", () => ({
  authService: authServiceMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, loading: false, error: null, initialized: false });
});

describe("authStore.kakaoLogin", () => {
  it("starts backend Kakao OAuth without creating a mock user", () => {
    useAuthStore.getState().kakaoLogin();

    expect(authServiceMock.startKakaoLogin).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().loading).toBe(true);
    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe("authStore.login", () => {
  it("stores the backend user returned by email login", async () => {
    authServiceMock.login.mockResolvedValue({
      user: {
        id: "user-1",
        name: "시설 관리자",
        email: "admin@sen.ai",
        role: "FACILITY_ADMIN",
        facilityId: "facility-1",
      },
    });

    const user = await useAuthStore.getState().login({
      email: "admin@sen.ai",
      password: "1234",
    });

    expect(authServiceMock.login).toHaveBeenCalledWith({
      email: "admin@sen.ai",
      password: "1234",
    });
    expect(user.email).toBe("admin@sen.ai");
    expect(useAuthStore.getState().user?.facilityId).toBe("facility-1");
    expect(useAuthStore.getState().loading).toBe(false);
  });
});

describe("authStore.register", () => {
  it("stores the backend user returned by signup", async () => {
    authServiceMock.register.mockResolvedValue({
      user: {
        id: "user-1",
        name: "홍원장",
        email: "owner@example.test",
        role: "FACILITY_ADMIN",
        facilityId: "facility-1",
      },
    });

    const user = await useAuthStore.getState().register({
      name: "홍원장",
      email: "owner@example.test",
      password: "Passw0rd!234",
      phone: "010-1111-2222",
      facilityName: "ULW 요양원",
    });

    expect(authServiceMock.register).toHaveBeenCalledWith({
      name: "홍원장",
      email: "owner@example.test",
      password: "Passw0rd!234",
      phone: "010-1111-2222",
      facilityName: "ULW 요양원",
    });
    expect(user.email).toBe("owner@example.test");
    expect(useAuthStore.getState().user?.facilityId).toBe("facility-1");
    expect(useAuthStore.getState().loading).toBe(false);
  });
});

describe("authStore.createFacility", () => {
  it("stores the backend user returned by onboarding", async () => {
    authServiceMock.createFacility.mockResolvedValue({
      user: {
        id: "user-1",
        name: "원장",
        email: "",
        role: "FACILITY_ADMIN",
        facilityId: "facility-1",
      },
    });

    const user = await useAuthStore.getState().createFacility({
      facilityName: "Happy Care Home",
    });

    expect(user.facilityId).toBe("facility-1");
    expect(useAuthStore.getState().user?.facilityId).toBe("facility-1");
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });
});
