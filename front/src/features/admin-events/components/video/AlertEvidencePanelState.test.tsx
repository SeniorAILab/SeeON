import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/apiClient";
import { alertService } from "@/services/alertService";
import type { AlertMediaMetadata } from "@/services/api/alertMedia";
import { AlertEvidencePanel } from "./AlertEvidencePanel";

vi.mock("@/services/alertService", () => ({
  alertService: {
    getMedia: vi.fn(),
    recordMediaAccess: vi.fn(),
  },
}));

class TestSetupError extends Error {
  readonly name = "TestSetupError";
}

const IDENTITY = {
  facilityId: "facility-1",
  alertId: "alert/a b",
  userId: "user-1",
} as const;

const READY_MEDIA: AlertMediaMetadata = {
  status: "READY",
  alertId: IDENTITY.alertId,
  clip: {
    contentType: "video/mp4",
    detectedAt: "2026-07-16T00:00:10.000Z",
    clipStartAt: "2026-07-16T00:00:00.000Z",
    clipEndAt: "2026-07-16T00:00:20.000Z",
    durationSeconds: 20,
  },
};

const getMediaMock = vi.mocked(alertService.getMedia);

beforeEach(() => {
  getMediaMock.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AlertEvidencePanel lifecycle rendering", () => {
  it.each([
    {
      name: "PENDING",
      result: {
        status: "PENDING",
        alertId: IDENTITY.alertId,
        retryAfterSeconds: 12,
      } satisfies AlertMediaMetadata,
      copy: "근거 영상을 준비하고 있습니다.",
    },
    {
      name: "UNAVAILABLE",
      result: {
        status: "UNAVAILABLE",
        alertId: IDENTITY.alertId,
      } satisfies AlertMediaMetadata,
      copy: "이 알림에 연결된 근거 영상이 없습니다.",
    },
    {
      name: "EXPIRED",
      result: {
        status: "EXPIRED",
        alertId: IDENTITY.alertId,
        expiredAt: "2026-07-16T01:00:00.000Z",
      } satisfies AlertMediaMetadata,
      copy: "보관 기간이 만료되어 더 이상 재생할 수 없습니다.",
    },
    {
      name: "DELETED",
      result: {
        status: "DELETED",
        alertId: IDENTITY.alertId,
        deletedAt: "2026-07-16T01:00:00.000Z",
      } satisfies AlertMediaMetadata,
      copy: "보관 정책에 따라 삭제되어 더 이상 재생할 수 없습니다.",
    },
  ] as const)("renders the explicit $name state", async ({ result, copy }) => {
    getMediaMock.mockResolvedValue(result);

    render(<AlertEvidencePanel identity={IDENTITY} />);

    expect(screen.getByText("영상 정보를 확인하는 중입니다.")).toBeTruthy();
    expect(await screen.findByText(copy)).toBeTruthy();
  });

  it.each([
    [new ApiError(403, "Forbidden"), "이 근거 영상을 확인할 권한이 없습니다."],
    [new ApiError(500, "Unavailable"), "영상 상태를 확인하지 못했습니다."],
  ] as const)("renders transport failures explicitly", async (error, copy) => {
    getMediaMock.mockRejectedValue(error);

    render(<AlertEvidencePanel identity={IDENTITY} />);

    expect(await screen.findByText(copy)).toBeTruthy();
  });

  it("renders a native same-origin player for READY without a clip id or token", async () => {
    getMediaMock.mockResolvedValue(READY_MEDIA);
    render(<AlertEvidencePanel identity={IDENTITY} />);

    const video = await screen.findByLabelText("낙상 감지 근거 영상");
    if (!(video instanceof HTMLVideoElement)) {
      throw new TestSetupError("Evidence player is not a video element");
    }
    expect(video.getAttribute("src")).toBe(
      "/api/v1/alerts/alert%2Fa%20b/media/content",
    );
    expect(video.getAttribute("src")).not.toContain("token");
    expect(video.getAttribute("src")).not.toContain("clip-");
    expect(video.getAttribute("controls")).not.toBeNull();
    expect(video.getAttribute("playsinline")).not.toBeNull();
    expect(video.getAttribute("controlslist")).toContain("nodownload");
    expect(video.getAttribute("width")).toBe("1280");
    expect(video.getAttribute("height")).toBe("720");
    expect(
      screen.getByText(/근거 영상은 최소 60일 보관 대상으로 관리됩니다/),
    ).toBeTruthy();
  });
});
