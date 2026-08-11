import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "@/services/apiClient";
import {
  EdgeEnrollmentResponseError,
  canAdministerEdgeCredentials,
  issueEdgeCredential,
  listEdgeCredentials,
  parseIssueEdgeCredential,
  parseRedactedEdgeCredentials,
  parseTopologyPreviewStatus,
  revokeEdgeCredential,
  rotateEdgeCredential,
} from "./edgeEnrollments";

vi.mock("@/services/apiClient", () => ({ requestJson: vi.fn() }));

const requestJsonMock = vi.mocked(requestJson);
const FACILITY_ID = "a5ff4ed1-7e63-4a4f-9ef0-42e807d74a64";
const INSTALLATION_ID = "c72bd9a7-3e04-47ba-a8cd-a56e54f98152";
const TOKEN_ID = "7H2K9M4QXP3R";
const IDEMPOTENCY_KEY = "0197f671-3a31-7a6c-a6e4-83ed412de801";
const ONE_TIME_VALUE = ["eft_v1", TOKEN_ID, "s".repeat(43)].join(".");

const REDACTED_CREDENTIAL = {
  tokenId: TOKEN_ID,
  prefix: "eft_v1.7H2K9M4QXP3R.[redacted]",
  lifecycle: "ACTIVE",
  edgeInstallationId: INSTALLATION_ID,
  enrollmentGeneration: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  valueState: "not-returned",
} as const;

const ISSUE_RESPONSE = {
  schemaVersion: 1,
  operationId: IDEMPOTENCY_KEY,
  facilityCode: "NH-7H2K9M4QXP",
  edgeInstallationId: INSTALLATION_ID,
  enrollmentGeneration: 1,
  lifecycle: "ACTIVE",
  oneTimeDisplay: {
    redacted: false,
    tokenId: TOKEN_ID,
    prefix: "eft_v1.7H2K9M4QXP3R.[redacted]",
    value: ONE_TIME_VALUE,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("edge enrollment API seam", () => {
  beforeEach(() => requestJsonMock.mockReset());

  it("issues a credential through the shared API client without serializing the one-time value", async () => {
    requestJsonMock.mockResolvedValue(ISSUE_RESPONSE);

    const result = await issueEdgeCredential({
      facilityId: FACILITY_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(requestJsonMock).toHaveBeenCalledWith("/admin/edge-credentials", {
      method: "POST",
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
      body: JSON.stringify({ schemaVersion: 1, facilityId: FACILITY_ID }),
    });
    expect(result.kind).toBe("initial");
    if (result.kind !== "initial") return;
    expect(result.oneTimeCredential.consume()).toBe(ONE_TIME_VALUE);
    expect(result.oneTimeCredential.consume()).toBeNull();
  });

  it("lists redacted credentials without a secret-shaped response field", async () => {
    requestJsonMock.mockResolvedValue({
      schemaVersion: 1,
      items: [REDACTED_CREDENTIAL],
    });

    const credentials = await listEdgeCredentials({ facilityId: FACILITY_ID });

    expect(requestJsonMock).toHaveBeenCalledWith(
      `/admin/edge-credentials?facilityId=${encodeURIComponent(FACILITY_ID)}`,
      { method: "GET" },
    );
    expect(credentials).toEqual([REDACTED_CREDENTIAL]);
  });

  it("rotates and revokes through idempotent credential paths", async () => {
    requestJsonMock
      .mockResolvedValueOnce({
        schemaVersion: 1,
        operationId: "0197f671-3a31-7a6c-a6e4-83ed412de802",
        edgeInstallationId: INSTALLATION_ID,
        enrollmentGeneration: 1,
        prior: {
          tokenId: TOKEN_ID,
          lifecycle: "GRACE",
          graceEndsAt: "2026-01-02T00:00:00.000Z",
        },
        replacement: { lifecycle: "ACTIVE" },
        oneTimeDisplay: ISSUE_RESPONSE.oneTimeDisplay,
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        operationId: "0197f671-3a31-7a6c-a6e4-83ed412de803",
        tokenId: TOKEN_ID,
        lifecycle: "REVOKED",
        revokedAt: "2026-01-01T00:05:00.000Z",
      });

    await rotateEdgeCredential({
      tokenId: TOKEN_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    await revokeEdgeCredential({
      tokenId: TOKEN_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      expectedLifecycle: "ACTIVE",
    });

    expect(requestJsonMock).toHaveBeenNthCalledWith(
      1,
      `/admin/edge-credentials/${TOKEN_ID}/rotate`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestJsonMock).toHaveBeenNthCalledWith(
      2,
      `/admin/edge-credentials/${TOKEN_ID}/revoke`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("edge enrollment response parsers", () => {
  it("clears a one-time credential on dispose and does not expose it through serialization", () => {
    const result = parseIssueEdgeCredential(ISSUE_RESPONSE);

    expect(result.kind).toBe("initial");
    if (result.kind !== "initial") return;
    result.oneTimeCredential.dispose();

    expect(result.oneTimeCredential.consume()).toBeNull();
    expect(JSON.stringify(result)).not.toContain(ONE_TIME_VALUE);
  });

  it.each([
    {
      schemaVersion: 1,
      items: [{ ...REDACTED_CREDENTIAL, lifecycle: "UNKNOWN" }],
    },
    {
      schemaVersion: 1,
      items: [{ ...REDACTED_CREDENTIAL, value: "unexpected" }],
    },
  ])("rejects malformed redacted credential inventory", (response) => {
    expect(() => parseRedactedEdgeCredentials(response)).toThrow(
      EdgeEnrollmentResponseError,
    );
  });

  it.each([
    {
      ...ISSUE_RESPONSE,
      oneTimeDisplay: { ...ISSUE_RESPONSE.oneTimeDisplay, redacted: true },
    },
    {
      ...ISSUE_RESPONSE,
      oneTimeDisplay: {
        ...ISSUE_RESPONSE.oneTimeDisplay,
        replay: "unexpected",
      },
    },
  ])("rejects repeated or malformed one-time retrieval shapes", (response) => {
    expect(() => parseIssueEdgeCredential(response)).toThrow(
      EdgeEnrollmentResponseError,
    );
  });

  it("exposes a super-admin capability guard without changing route policy", () => {
    expect(canAdministerEdgeCredentials("SUPER_ADMIN")).toBe(true);
    expect(canAdministerEdgeCredentials("ADMIN")).toBe(false);
    expect(canAdministerEdgeCredentials(null)).toBe(false);
  });

  it("parses pending topology omissions and the confirmed empty-preview status", () => {
    const base = {
      schemaVersion: 1,
      snapshotId: "0197f671-3a31-7a6c-a6e4-83ed412de81a",
      clientRevision: 1,
      serverRevision: 1,
      result: {
        floors: { created: 1, updated: 0, unchanged: 0 },
        rooms: { created: 1, updated: 0, unchanged: 0 },
        cameras: { created: 1, updated: 0, unchanged: 0 },
      },
    } as const;

    expect(
      parseTopologyPreviewStatus({ ...base, omissions: null }),
    ).toMatchObject({
      kind: "clear",
    });
    expect(
      parseTopologyPreviewStatus({
        ...base,
        omissions: {
          confirmationId: "0197f671-3a31-7a6c-a6e4-83ed412de81b",
          digest:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          expiresAt: "2026-01-01T00:15:00.000Z",
          cameras: ["camera-000-old"],
          rooms: [],
          floors: [],
        },
      }),
    ).toMatchObject({ kind: "pending", cameraCount: 1 });
  });
});
