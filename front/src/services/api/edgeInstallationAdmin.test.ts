import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "@/services/apiClient";
import {
  createEdgeValidationRun,
  listEdgeValidationEvents,
  replaceEdgeInstallation,
  transferEdgeOwnership,
} from "./edgeInstallationAdmin";

vi.mock("@/services/apiClient", () => ({ requestJson: vi.fn() }));

const requestJsonMock = vi.mocked(requestJson);
const INSTALLATION_ID = "c72bd9a7-3e04-47ba-a8cd-a56e54f98152";
const CLIENT_REF = "8b0f5ba2-d359-4d8e-948f-e386ac40c347";
const OPERATION_ID = "0197f671-3a31-7a6c-a6e4-83ed412de801";
const VALIDATION_RUN_ID = "0197f671-3a31-7a6c-a6e4-83ed412de802";
const TOKEN_ID = "7H2K9M4QXP3R";
const ONE_TIME_VALUE = ["eft_v1", TOKEN_ID, "s".repeat(43)].join(".");
const MANIFEST_DIGEST = "a".repeat(64);

const OPERATION = {
  operationId: OPERATION_ID,
  status: "SUCCEEDED",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("edge installation admin API seam", () => {
  beforeEach(() => requestJsonMock.mockReset());

  it("replaces an installation and returns a consumable one-time credential", async () => {
    requestJsonMock.mockResolvedValue({
      schemaVersion: 1,
      operation: OPERATION,
      edgeInstallationId: INSTALLATION_ID,
      previousEnrollmentGeneration: 1,
      enrollmentGeneration: 2,
      installationState: "PENDING_CLAIM",
      oneTimeDisplay: {
        redacted: false,
        tokenId: TOKEN_ID,
        prefix: "eft_v1.7H2K9M4QXP3R.[redacted]",
        value: ONE_TIME_VALUE,
      },
    });

    const result = await replaceEdgeInstallation({
      edgeInstallationId: INSTALLATION_ID,
      expectedEnrollmentGeneration: 1,
      newClientInstallationRef: CLIENT_REF,
      idempotencyKey: OPERATION_ID,
    });

    expect(requestJsonMock).toHaveBeenCalledWith(
      `/admin/edge-installations/${INSTALLATION_ID}/replace`,
      expect.objectContaining({
        method: "POST",
        headers: { "Idempotency-Key": OPERATION_ID },
      }),
    );
    expect(result.kind).toBe("initial");
    if (result.kind !== "initial") return;
    expect(result.oneTimeCredential.consume()).toBe(ONE_TIME_VALUE);
    expect(result.oneTimeCredential.consume()).toBeNull();
  });

  it("creates a validation run and reads only redacted event summaries", async () => {
    requestJsonMock
      .mockResolvedValueOnce({
        schemaVersion: 1,
        operation: OPERATION,
        validationRunId: VALIDATION_RUN_ID,
        edgeInstallationId: INSTALLATION_ID,
        enrollmentGeneration: 2,
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:15:00.000Z",
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        items: [
          {
            id: "a5ff4ed1-7e63-4a4f-9ef0-42e807d74a64",
            detectedAt: "2026-01-01T00:02:00.000Z",
            validationRunId: VALIDATION_RUN_ID,
            room: "private room detail that must not cross the adapter",
          },
        ],
      });

    const run = await createEdgeValidationRun({
      edgeInstallationId: INSTALLATION_ID,
      expectedEnrollmentGeneration: 2,
      durationSeconds: 900,
      idempotencyKey: OPERATION_ID,
    });
    const events = await listEdgeValidationEvents({
      edgeInstallationId: INSTALLATION_ID,
      validationRunId: VALIDATION_RUN_ID,
    });

    expect(run.status).toBe("ACTIVE");
    expect(events).toEqual([
      {
        id: "a5ff4ed1-7e63-4a4f-9ef0-42e807d74a64",
        detectedAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
  });

  it("submits the confirmed ownership-transfer manifest", async () => {
    requestJsonMock.mockResolvedValue({
      schemaVersion: 1,
      operation: OPERATION,
      edgeInstallationId: INSTALLATION_ID,
      enrollmentGeneration: 2,
      serverRevision: 4,
      transferred: { floors: 1, rooms: 1, cameras: 1 },
      appliedAt: "2026-01-01T00:05:00.000Z",
    });
    const manifest = [
      {
        kind: "CAMERA",
        edgeRef: "camera-001",
        canonicalId: "a5ff4ed1-7e63-4a4f-9ef0-42e807d74a64",
        parentCanonicalId: "8b0f5ba2-d359-4d8e-948f-e386ac40c347",
      },
    ] as const;

    const result = await transferEdgeOwnership({
      edgeInstallationId: INSTALLATION_ID,
      expectedEnrollmentGeneration: 2,
      expectedServerRevision: 3,
      manifestDigest: MANIFEST_DIGEST,
      manifest,
      idempotencyKey: OPERATION_ID,
    });

    expect(result.transferred).toEqual({ floors: 1, rooms: 1, cameras: 1 });
    expect(requestJsonMock).toHaveBeenCalledWith(
      `/admin/edge-installations/${INSTALLATION_ID}/transfers`,
      expect.objectContaining({ body: JSON.stringify({
        schemaVersion: 1,
        expectedEnrollmentGeneration: 2,
        expectedServerRevision: 3,
        manifestDigest: MANIFEST_DIGEST,
        manifest,
      }) }),
    );
  });

  it("rejects secret-bearing validation responses", async () => {
    requestJsonMock.mockResolvedValue({
      schemaVersion: 1,
      operation: OPERATION,
      validationRunId: VALIDATION_RUN_ID,
      edgeInstallationId: INSTALLATION_ID,
      enrollmentGeneration: 2,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:15:00.000Z",
      token: ONE_TIME_VALUE,
    });

    await expect(createEdgeValidationRun({
      edgeInstallationId: INSTALLATION_ID,
      expectedEnrollmentGeneration: 2,
      durationSeconds: 900,
      idempotencyKey: OPERATION_ID,
    })).rejects.toMatchObject({ name: "EdgeEnrollmentResponseError" });
  });
});
