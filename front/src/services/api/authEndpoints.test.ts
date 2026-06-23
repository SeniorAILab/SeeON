import { describe, expect, it } from "vitest";
import {
  mapBackendRoleToFrontRole,
  parseAuthSessionResponse,
} from "./authEndpoints";

describe("auth endpoint mappers", () => {
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
});
