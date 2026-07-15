import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "@/services/apiClient";
import {
  AlertMediaResponseError,
  buildAlertMediaContentPath,
  getAlertMediaEndpoint,
  parseAlertMedia,
  recordAlertMediaAccessEndpoint,
} from "./alertMedia";

vi.mock("@/services/apiClient", () => ({
  buildApiUrl: (path: string) => `/api/v1${path}`,
  requestJson: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);

const READY_RESPONSE = {
  status: "READY",
  alertId: "alert-1",
  clip: {
    contentType: "video/mp4",
    detectedAt: "2026-07-16T00:00:10.000Z",
    clipStartAt: "2026-07-16T00:00:00.000Z",
    clipEndAt: "2026-07-16T00:00:20.000Z",
    durationSeconds: 20,
  },
} as const;

describe("alert media API seam", () => {
  beforeEach(() => {
    requestJsonMock.mockReset();
  });

  it("loads and parses READY metadata with an encoded alert-only route", async () => {
    const controller = new AbortController();
    requestJsonMock.mockResolvedValue({ ...READY_RESPONSE, alertId: "alert/a b" });

    const media = await getAlertMediaEndpoint("alert/a b", controller.signal);

    expect(requestJsonMock).toHaveBeenCalledWith(
      "/alerts/alert%2Fa%20b/media",
      { signal: controller.signal },
    );
    expect(media).toEqual({ ...READY_RESPONSE, alertId: "alert/a b" });
  });

  it("derives the same-origin content path without a token or clip identifier", () => {
    const path = buildAlertMediaContentPath("alert/a b");

    expect(path).toBe("/api/v1/alerts/alert%2Fa%20b/media/content");
    expect(path).not.toContain("token");
    expect(path).not.toContain("clip-1");
  });

  it("posts only the confirmed interaction action to the alert route", async () => {
    requestJsonMock.mockResolvedValue({ accepted: true });

    await recordAlertMediaAccessEndpoint({
      alertId: "alert/a b",
      action: "FULLSCREEN_ENTERED",
      interactionId: "interaction-1",
    });

    expect(requestJsonMock).toHaveBeenCalledWith(
      "/alerts/alert%2Fa%20b/media/access",
      {
        method: "POST",
        body: JSON.stringify({
          action: "FULLSCREEN_ENTERED",
          interactionId: "interaction-1",
        }),
      },
    );
  });
});

describe("parseAlertMedia", () => {
  it.each([
    [{ status: "PENDING", alertId: "alert-1", retryAfterSeconds: null }, "PENDING"],
    [READY_RESPONSE, "READY"],
    [{ status: "UNAVAILABLE", alertId: "alert-1" }, "UNAVAILABLE"],
    [{ status: "EXPIRED", alertId: "alert-1", expiredAt: "2026-07-16T01:00:00.000Z" }, "EXPIRED"],
    [{ status: "DELETED", alertId: "alert-1", deletedAt: "2026-07-16T01:00:00.000Z" }, "DELETED"],
  ])("accepts the closed %s lifecycle branch", (response, expectedStatus) => {
    expect(parseAlertMedia(response, "alert-1").status).toBe(expectedStatus);
  });

  it.each([
    {
      name: "route alert mismatch",
      response: { ...READY_RESPONSE, alertId: "different-alert" },
    },
    {
      name: "unknown lifecycle",
      response: { ...READY_RESPONSE, status: "UNKNOWN" },
    },
    {
      name: "forbidden clip identifier",
      response: {
        ...READY_RESPONSE,
        clip: { ...READY_RESPONSE.clip, id: "clip-1" },
      },
    },
    {
      name: "zero duration",
      response: {
        ...READY_RESPONSE,
        clip: { ...READY_RESPONSE.clip, durationSeconds: 0 },
      },
    },
    {
      name: "invalid instant",
      response: {
        ...READY_RESPONSE,
        clip: { ...READY_RESPONSE.clip, detectedAt: "invalid" },
      },
    },
    {
      name: "invalid timestamp order",
      response: {
        ...READY_RESPONSE,
        clip: {
          ...READY_RESPONSE.clip,
          clipStartAt: "2026-07-16T00:00:11.000Z",
        },
      },
    },
  ])("rejects malformed metadata: $name", ({ response }) => {
    expect(() => parseAlertMedia(response, "alert-1")).toThrow(
      AlertMediaResponseError,
    );
  });
});
