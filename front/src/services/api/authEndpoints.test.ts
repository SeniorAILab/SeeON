import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFacilityEndpoint,
  loginEndpoint,
  mapBackendRoleToFrontRole,
  parseAuthSessionResponse,
  registerEndpoint,
} from "./authEndpoints";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("auth endpoint mappers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a backend session response into a frontend auth session", () => {
    const session = parseAuthSessionResponse({
      user: {
        id: "user-1",
        email: "admin@sen.ai",
        nickname: " 원장 ",
        role: "ADMIN",
        facilityId: "facility-1",
      },
    });

    expect(session).toEqual({
      user: {
        id: "user-1",
        name: "원장",
      email: "admin@sen.ai",
      role: "FACILITY_ADMIN",
      facilityId: "facility-1",
    },
  });
  });

  it("rejects malformed backend session responses", () => {
    expect(parseAuthSessionResponse({ user: { role: "ADMIN" } })).toBeNull();
    expect(parseAuthSessionResponse({ user: null })).toBeNull();
    expect(parseAuthSessionResponse({})).toBeNull();
  });

  it("keeps backend caregiver users as staff in the frontend", () => {
    expect(mapBackendRoleToFrontRole("CAREGIVER")).toBe("STAFF");
  });

  it("logs in through the backend password endpoint", async () => {
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

    const session = await loginEndpoint({
      email: "admin@sen.ai",
      password: "1234",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "admin@sen.ai",
          password: "1234",
        }),
      })
    );
    expect(session.user.email).toBe("admin@sen.ai");
  });

  it("registers through the backend signup endpoint with cookie credentials", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        okJsonResponse({
          user: {
            id: "user-1",
            email: "owner@example.test",
            nickname: "홍원장",
            role: "ADMIN",
            facilityId: "facility-1",
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const session = await registerEndpoint({
      name: "홍원장",
      email: "owner@example.test",
      password: "Passw0rd!234",
      phone: "010-1111-2222",
      facilityName: "ULW 요양원",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          name: "홍원장",
          email: "owner@example.test",
          password: "Passw0rd!234",
          phone: "010-1111-2222",
          facilityName: "ULW 요양원",
        }),
      })
    );
    expect(session.user.email).toBe("owner@example.test");
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

    const session = await createFacilityEndpoint({
      facilityName: "Happy Care Home",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/facilities",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          facilityName: "Happy Care Home",
        }),
      })
    );
    expect(session?.user.facilityId).toBe("facility-1");
  });
});
