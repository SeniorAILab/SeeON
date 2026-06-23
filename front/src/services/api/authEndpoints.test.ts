import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFacilityEndpoint,
  mapBackendRoleToFrontRole,
  parseAuthSessionResponse,
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
        nickname: " 원장 ",
        role: "ADMIN",
        facilityId: "facility-1",
      },
    });

    expect(session).toEqual({
      user: {
        id: "user-1",
        name: "원장",
        email: "",
        role: "FACILITY_ADMIN",
        facilityId: "facility-1",
      },
      token: "",
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
      businessRegistrationNumber: "123-45",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/facilities",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          facilityName: "Happy Care Home",
          businessRegistrationNumber: "123-45",
        }),
      })
    );
    expect(session?.user.facilityId).toBe("facility-1");
  });
});
