import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFacilityEndpoint,
  loginEndpoint,
  parseRole,
  parseAuthSessionResponse,
  registerEndpoint,
  restoreSessionEndpoint,
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
        role: "ADMIN",
        facilityId: "facility-1",
      },
    });
  });

  it("rejects malformed backend session responses", () => {
    expect(parseAuthSessionResponse({ user: { role: "ADMIN" } })).toBeNull();
    expect(parseAuthSessionResponse({ user: null })).toBeNull();
    expect(parseAuthSessionResponse({})).toBeNull();
  });

  it("rejects legacy backend role names instead of silently mapping them", () => {
    expect(
      parseAuthSessionResponse({
        user: {
          id: "user-1",
          email: "staff@sen.ai",
          nickname: "직원",
          role: "CARE" + "GIVER",
          facilityId: "facility-1",
        },
      })
    ).toBeNull();
    expect(parseRole("CARE" + "GIVER")).toBeNull();
  });

  it("parses the shared API role contract", () => {
    expect(parseRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    expect(parseRole("ADMIN")).toBe("ADMIN");
    expect(parseRole("STAFF")).toBe("STAFF");
  });

  it("restores identity through /auth/me with cookie credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okJsonResponse({
        id: "user-1",
        email: "admin@sen.ai",
        nickname: "원장",
        role: "ADMIN",
        facilityId: "facility-1",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await restoreSessionEndpoint();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
    expect(session?.user).toMatchObject({
      id: "user-1",
      email: "admin@sen.ai",
      name: "원장",
      role: "ADMIN",
      facilityId: "facility-1",
    });
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
      "/api/v1/auth/login",
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
      "/api/v1/auth/register",
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
