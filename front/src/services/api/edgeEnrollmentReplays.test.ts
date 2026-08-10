import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "@/services/apiClient";
import {
  EdgeEnrollmentResponseError,
  issueEdgeCredential,
  parseIssueEdgeCredential,
  revokeEdgeCredential,
} from "./edgeEnrollments";
import { parseRotateEdgeCredential } from "./edgeEnrollmentParsers";

vi.mock("@/services/apiClient", () => ({ requestJson: vi.fn() }));

const requestJsonMock = vi.mocked(requestJson);
const FACILITY_ID = "a5ff4ed1-7e63-4a4f-9ef0-42e807d74a64";
const INSTALLATION_ID = "c72bd9a7-3e04-47ba-a8cd-a56e54f98152";
const TOKEN_ID = "7H2K9M4QXP3R";
const REPLACEMENT_TOKEN_ID = "8J3M0N5RQV4S";
const OPERATION_ID = "0197f671-3a31-7a6c-a6e4-83ed412de802";
const IDEMPOTENCY_KEY = "0197f671-3a31-7a6c-a6e4-83ed412de801";
const INSTANT = "2026-01-01T00:00:00.000Z";
const ONE_TIME_VALUE = ["eft_v1", REPLACEMENT_TOKEN_ID, "s".repeat(43)].join(
  ".",
);

const OPERATION = {
  operationId: OPERATION_ID,
  status: "SUCCEEDED",
  createdAt: INSTANT,
  updatedAt: INSTANT,
} as const;

const ISSUE_REPLAY = {
  schemaVersion: 1,
  operation: OPERATION,
  credential: {
    tokenId: TOKEN_ID,
    tokenPrefix: `eft_v1.${TOKEN_ID}.[redacted]`,
    facilityId: FACILITY_ID,
    edgeInstallationId: INSTALLATION_ID,
    enrollmentGeneration: 1,
    lifecycle: "ACTIVE",
    issuedAt: INSTANT,
    expiresAt: null,
    graceExpiresAt: null,
    revokedAt: null,
  },
  installation: {
    edgeInstallationId: INSTALLATION_ID,
    facilityId: FACILITY_ID,
    enrollmentGeneration: 1,
    state: "CLAIMED",
    clientInstallationRef: "8b0f5ba2-d359-4d8e-948f-e386ac40c347",
    acceptedClientRevision: 1,
    serverRevision: 2,
  },
  secretDisplay: "NOT_AVAILABLE",
} as const;

const ROTATE_REPLAY = {
  schemaVersion: 1,
  operationId: OPERATION_ID,
  edgeInstallationId: INSTALLATION_ID,
  enrollmentGeneration: 1,
  prior: {
    tokenId: TOKEN_ID,
    lifecycle: "GRACE",
    graceEndsAt: "2026-01-02T00:00:00.000Z",
  },
  replacement: { lifecycle: "ACTIVE" },
  oneTimeDisplay: {
    redacted: true,
    tokenId: REPLACEMENT_TOKEN_ID,
    prefix: `eft_v1.${REPLACEMENT_TOKEN_ID}.[redacted]`,
  },
} as const;

describe("edge credential idempotent replays", () => {
  beforeEach(() => requestJsonMock.mockReset());

  it("parses a canonical issue replay without constructing a one-time holder", async () => {
    requestJsonMock.mockResolvedValue(ISSUE_REPLAY);

    const result = await issueEdgeCredential({
      facilityId: FACILITY_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toMatchObject({
      kind: "replay",
      secretDisplay: "NOT_AVAILABLE",
    });
    expect("oneTimeCredential" in result).toBe(false);
  });

  it("rejects an issue replay carrying an extra credential value", () => {
    const response = { ...ISSUE_REPLAY, value: ONE_TIME_VALUE };

    expect(() => parseIssueEdgeCredential(response)).toThrow(
      EdgeEnrollmentResponseError,
    );
  });

  it("rejects an issue replay with an impossible canonical timestamp", () => {
    const response = {
      ...ISSUE_REPLAY,
      operation: {
        ...ISSUE_REPLAY.operation,
        createdAt: "2026-02-30T00:00:00.000Z",
      },
    };

    expect(() => parseIssueEdgeCredential(response)).toThrow(
      EdgeEnrollmentResponseError,
    );
  });

  it("parses a canonical rotation replay without constructing a one-time holder", () => {
    const result = parseRotateEdgeCredential(ROTATE_REPLAY);

    expect(result).toMatchObject({
      kind: "replay",
      replacementTokenId: REPLACEMENT_TOKEN_ID,
    });
    expect("oneTimeCredential" in result).toBe(false);
  });

  it("rejects a redacted rotation replay that includes a credential value", () => {
    const response = {
      ...ROTATE_REPLAY,
      oneTimeDisplay: {
        ...ROTATE_REPLAY.oneTimeDisplay,
        value: ONE_TIME_VALUE,
      },
    };

    expect(() => parseRotateEdgeCredential(response)).toThrow(
      EdgeEnrollmentResponseError,
    );
  });
});

describe("edge credential revoke lifecycle", () => {
  beforeEach(() => requestJsonMock.mockReset());

  it.each(["ACTIVE", "GRACE"] as const)(
    "sends the explicit %s expected lifecycle",
    async (expectedLifecycle) => {
      requestJsonMock.mockResolvedValue({
        schemaVersion: 1,
        operationId: OPERATION_ID,
        tokenId: TOKEN_ID,
        lifecycle: "REVOKED",
        revokedAt: INSTANT,
      });

      await revokeEdgeCredential({
        tokenId: TOKEN_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        expectedLifecycle,
      });

      expect(requestJsonMock).toHaveBeenCalledWith(
        `/admin/edge-credentials/${TOKEN_ID}/revoke`,
        expect.objectContaining({
          body: JSON.stringify({
            schemaVersion: 1,
            expectedLifecycle,
            reason: "ADMIN_REVOKED",
          }),
        }),
      );
    },
  );
});
