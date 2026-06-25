import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authService, mapBackendRoleToFrontRole } from "./authService";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authService backend session", () => {
  it("logs in with email/password through the backend", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        okJsonResponse({
          user: {
            id: "user-1",
            email: "admin@sen.ai",
            nickname: "원장",
            role: "ADMIN",
            facilityId: "facility-1",
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const session = await authService.login({
      email: "admin@sen.ai",
      password: "1234",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
    expect(session.user.email).toBe("admin@sen.ai");
  });

  it("bootstraps the current user from the backend session cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        okJsonResponse({
          user: {
            id: "user-1",
            nickname: "원장",
            role: "ADMIN",
            facilityId: "facility-1",
          },
        })
      )
    );

    const session = await authService.bootstrap();

    expect(session?.user).toEqual({
      id: "user-1",
      name: "원장",
      email: "",
      role: "FACILITY_ADMIN",
      facilityId: "facility-1",
    });
  });

  it("returns null when no backend session is available", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(authService.bootstrap()).resolves.toBeNull();
  });

  it("creates a facility through the backend onboarding endpoint", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        okJsonResponse({
          user: {
            id: "user-1",
            nickname: "원장",
            role: "ADMIN",
            facilityId: "facility-1",
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const session = await authService.createFacility({
      facilityName: "Happy Care Home",
      businessRegistrationNumber: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/facilities",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
    expect(session.user.facilityId).toBe("facility-1");
  });
});

describe("mapBackendRoleToFrontRole", () => {
  it("maps backend RBAC roles without exposing CAREGIVER as facility admin", () => {
    expect(mapBackendRoleToFrontRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    expect(mapBackendRoleToFrontRole("ADMIN")).toBe("FACILITY_ADMIN");
    expect(mapBackendRoleToFrontRole("CAREGIVER")).toBe("STAFF");
  });
});
