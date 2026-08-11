import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { alertService } from "@/services/alertService";
import type { AlertMediaMetadata } from "@/services/api/alertMedia";
import { useAuthStore } from "@/stores/authStore";
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

class Deferred<T> {
  private resolver: ((value: T) => void) | null = null;
  readonly promise = new Promise<T>((resolve) => {
    this.resolver = resolve;
  });

  resolve(value: T): void {
    const resolver = this.resolver;
    if (resolver === null) throw new TestSetupError("Deferred resolver missing");
    resolver(value);
  }
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
const recordAccessMock = vi.mocked(alertService.recordMediaAccess);

async function findEvidenceVideo(): Promise<HTMLVideoElement> {
  const element = await screen.findByLabelText("낙상 감지 근거 영상");
  if (!(element instanceof HTMLVideoElement)) {
    throw new TestSetupError("Evidence player is not a video element");
  }
  return element;
}

beforeEach(() => {
  getMediaMock.mockReset();
  recordAccessMock.mockReset();
  recordAccessMock.mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
  useAuthStore.setState({ user: null, initialized: false });
});

describe("AlertEvidencePanel media behavior", () => {
  it("keeps native playback intact and adds download only for a facility admin", async () => {
    useAuthStore.setState({
      user: {
        id: "admin-1",
        name: "원장님",
        email: "admin@example.test",
        role: "ADMIN",
        facilityId: IDENTITY.facilityId,
      },
      initialized: true,
    });
    getMediaMock.mockResolvedValue(READY_MEDIA);

    render(<AlertEvidencePanel identity={IDENTITY} />);

    const video = await findEvidenceVideo();
    expect(video.controls).toBe(true);
    expect(video.getAttribute("src")).toContain("/alerts/alert%2Fa%20b/media/content");
    expect(screen.getByRole("button", { name: "사건 영상 다운로드" })).toBeTruthy();
  });

  it("records only confirmed native play and fullscreen media events", async () => {
    getMediaMock.mockResolvedValue(READY_MEDIA);
    render(<AlertEvidencePanel identity={IDENTITY} />);
    const video = await findEvidenceVideo();

    fireEvent.play(video);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: video,
    });
    fireEvent(video, new Event("fullscreenchange", { bubbles: true }));

    await waitFor(() => expect(recordAccessMock).toHaveBeenCalledTimes(2));
    expect(recordAccessMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        alertId: IDENTITY.alertId,
        action: "PLAY_STARTED",
      }),
    );
    expect(recordAccessMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        alertId: IDENTITY.alertId,
        action: "FULLSCREEN_ENTERED",
      }),
    );
  });

  it("tears down in order and refreshes metadata exactly once after playback errors", async () => {
    getMediaMock.mockResolvedValueOnce(READY_MEDIA).mockResolvedValueOnce(READY_MEDIA);
    render(<AlertEvidencePanel identity={IDENTITY} />);
    const firstVideo = await findEvidenceVideo();
    const teardownOrder: string[] = [];
    const originalRemoveAttribute = firstVideo.removeAttribute.bind(firstVideo);
    vi.spyOn(firstVideo, "pause").mockImplementation(() => {
      teardownOrder.push("pause");
    });
    vi.spyOn(firstVideo, "removeAttribute").mockImplementation((name) => {
      if (name === "src") teardownOrder.push("remove-src");
      originalRemoveAttribute(name);
    });
    vi.spyOn(firstVideo, "load").mockImplementation(() => {
      teardownOrder.push("load");
    });

    fireEvent.error(firstVideo);

    await waitFor(() => expect(getMediaMock).toHaveBeenCalledTimes(2));
    expect(teardownOrder.slice(0, 3)).toEqual(["pause", "remove-src", "load"]);

    const retriedVideo = await findEvidenceVideo();
    fireEvent.error(retriedVideo);

    expect(await screen.findByText("영상을 재생하지 못했습니다.")).toBeTruthy();
    expect(getMediaMock).toHaveBeenCalledTimes(2);
  });

  it("tears down the old media before an identity change can paint the next alert", async () => {
    const nextAlert = new Deferred<AlertMediaMetadata>();
    getMediaMock
      .mockResolvedValueOnce(READY_MEDIA)
      .mockReturnValueOnce(nextAlert.promise);
    const { rerender } = render(<AlertEvidencePanel identity={IDENTITY} />);
    const video = await findEvidenceVideo();
    const teardownOrder: string[] = [];
    const originalRemoveAttribute = video.removeAttribute.bind(video);
    vi.spyOn(video, "pause").mockImplementation(() => {
      teardownOrder.push("pause");
    });
    vi.spyOn(video, "removeAttribute").mockImplementation((name) => {
      if (name === "src") teardownOrder.push("remove-src");
      originalRemoveAttribute(name);
    });
    vi.spyOn(video, "load").mockImplementation(() => {
      teardownOrder.push("load");
    });

    rerender(
      <AlertEvidencePanel
        identity={{
          facilityId: "facility-2",
          alertId: "alert-2",
          userId: "user-2",
        }}
      />,
    );

    await waitFor(() => {
      expect(teardownOrder.slice(0, 3)).toEqual(["pause", "remove-src", "load"]);
    });
    expect(screen.queryByLabelText("낙상 감지 근거 영상")).toBeNull();
  });

  it("aborts A and never paints its late READY result after facility, alert, and user move to B", async () => {
    const alertA = new Deferred<AlertMediaMetadata>();
    const alertB = new Deferred<AlertMediaMetadata>();
    const signals: AbortSignal[] = [];
    getMediaMock.mockImplementation((alertId, signal) => {
      signals.push(signal);
      return alertId === "alert-a" ? alertA.promise : alertB.promise;
    });
    const { rerender } = render(
      <AlertEvidencePanel
        identity={{ facilityId: "facility-a", alertId: "alert-a", userId: "user-a" }}
      />,
    );

    rerender(
      <AlertEvidencePanel
        identity={{ facilityId: "facility-b", alertId: "alert-b", userId: "user-b" }}
      />,
    );
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      alertB.resolve({ ...READY_MEDIA, alertId: "alert-b" });
      await alertB.promise;
    });
    expect((await findEvidenceVideo()).getAttribute("src"))
      .toContain("/alerts/alert-b/media/content");

    await act(async () => {
      alertA.resolve({ ...READY_MEDIA, alertId: "alert-a" });
      await alertA.promise;
    });
    expect(screen.getByLabelText("낙상 감지 근거 영상").getAttribute("src"))
      .toContain("/alerts/alert-b/media/content");
  });
});
