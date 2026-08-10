import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AlertMediaDownloadError,
  downloadAlertMediaAttachment,
} from "@/services/api/alertMediaDownloads";
import { useAuthStore } from "@/stores/authStore";
import { AlertMediaDownloadButton } from "./AlertMediaDownloadButton";

vi.mock("@/services/api/alertMediaDownloads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api/alertMediaDownloads")>();
  return { ...actual, downloadAlertMediaAttachment: vi.fn() };
});

const downloadMock = vi.mocked(downloadAlertMediaAttachment);
const ALERT_ID = "alert-1";
let observedFilename = "";

function setRole(role: "ADMIN" | "SUPER_ADMIN" | "STAFF"): void {
  useAuthStore.setState({
    user: {
      id: "user-1",
      name: "사용자",
      email: "user@example.test",
      role,
      facilityId: "facility-1",
    },
    initialized: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  observedFilename = "";
  setRole("ADMIN");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:incident-download"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
    observedFilename = this.download;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, initialized: false });
});

describe("AlertMediaDownloadButton", () => {
  it("downloads the validated attachment filename and reports completion", async () => {
    downloadMock.mockResolvedValue({
      kind: "full",
      content: new Blob(["video"], { type: "video/mp4" }),
      filename: "incident-0197f671.mp4",
      contentType: "video/mp4",
      byteLength: 5,
    });
    render(<AlertMediaDownloadButton alertId={ALERT_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "사건 영상 다운로드" }));

    expect((await screen.findByRole("status")).textContent).toContain("다운로드를 시작했습니다.");
    expect(observedFilename).toBe("incident-0197f671.mp4");
    expect(downloadMock).toHaveBeenCalledWith({
      alertId: ALERT_ID,
      signal: expect.any(AbortSignal),
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:incident-download");
  });

  it("hides the download action from staff", () => {
    setRole("STAFF");

    render(<AlertMediaDownloadButton alertId={ALERT_ID} />);

    expect(screen.queryByRole("button", { name: "사건 영상 다운로드" })).toBeNull();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it.each([
    [new AlertMediaDownloadError(403, "FORBIDDEN"), "다운로드 권한이 없습니다."],
    [new AlertMediaDownloadError(410, "UNAVAILABLE"), "다운로드할 영상이 없습니다."],
    [new AlertMediaDownloadError(416, "RANGE_NOT_SATISFIABLE"), "전체 영상을 다시 요청해 주세요."],
  ])("maps attachment failures to nonsecret Korean status", async (error, message) => {
    downloadMock.mockRejectedValue(error);
    render(<AlertMediaDownloadButton alertId={ALERT_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "사건 영상 다운로드" }));

    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });

  it("does not expose unexpected error details", async () => {
    downloadMock.mockRejectedValue(new Error("eft_v1.secret-bearing-network-error"));
    render(<AlertMediaDownloadButton alertId={ALERT_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "사건 영상 다운로드" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "다운로드를 준비하지 못했습니다. 다시 시도해 주세요.",
    );
    expect(document.body.textContent).not.toContain("eft_v1");
  });

  it("aborts an in-flight attachment request on navigation", async () => {
    const captured: { current: AbortSignal | null } = { current: null };
    downloadMock.mockImplementation((request) => {
      captured.current = request.signal ?? null;
      return new Promise(() => undefined);
    });
    const { unmount } = render(<AlertMediaDownloadButton alertId={ALERT_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "사건 영상 다운로드" }));
    await waitFor(() => expect(captured.current).not.toBeNull());

    unmount();

    expect(captured.current?.aborted).toBe(true);
  });
});
