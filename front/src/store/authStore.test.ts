import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./authStore";

const authServiceMock = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  createFacility: vi.fn(),
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
      token: "",
    });

    const user = await useAuthStore.getState().createFacility({
      facilityName: "Happy Care Home",
      businessRegistrationNumber: null,
    });

    expect(user.facilityId).toBe("facility-1");
    expect(useAuthStore.getState().user?.facilityId).toBe("facility-1");
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });
});
