import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsPage } from "./AlertsPage";
import type { AlertView } from "@/types";

vi.mock("@/services/alertService", () => ({
  alertService: {
    listRecent: vi.fn(),
    resolve: vi.fn(),
    listNotes: vi.fn(),
  },
}));

const resolvedAlert = {
  id: "alert-resolved-1",
  room: "201호",
  status: "RESOLVED",
  type: "fall",
  detectedAt: "2026-07-03T00:00:00.000Z",
  resolvedAt: "2026-07-03T00:10:00.000Z",
  resolvedByName: "요양보호사",
} as AlertView;
const resolvedAlertB = {
  ...resolvedAlert,
  id: "alert-resolved-2",
  room: "202호",
} as AlertView;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  const { alertService } = await import("@/services/alertService");
  vi.mocked(alertService.listRecent).mockResolvedValue([resolvedAlert]);
  vi.mocked(alertService.listNotes).mockReset();
  vi.mocked(alertService.listNotes).mockResolvedValue([
    {
      id: "note-1",
      type: "MEMO",
      note: "침상 안전을 확인했습니다.",
      createdBy: "staff-1",
      authorRole: "STAFF",
      createdAt: "2026-07-03T00:05:00.000Z",
    },
  ]);
});

describe("AlertsPage resolved notes", () => {
  it("opens a read-only memo history for a resolved alert", async () => {
    const { alertService } = await import("@/services/alertService");
    render(<AlertsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "메모 보기" }));

    expect(await screen.findByRole("dialog", { name: "201호 메모 히스토리" })).toBeTruthy();
    expect(await screen.findByText("침상 안전을 확인했습니다.")).toBeTruthy();
    expect(screen.getByText(/STAFF/)).toBeTruthy();
    expect(alertService.listNotes).toHaveBeenCalledWith("alert-resolved-1");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("keeps the latest resolved alert notes when an earlier request finishes last", async () => {
    const { alertService } = await import("@/services/alertService");
    const notesA = deferred<Awaited<ReturnType<typeof alertService.listNotes>>>();
    const notesB = deferred<Awaited<ReturnType<typeof alertService.listNotes>>>();
    vi.mocked(alertService.listRecent).mockResolvedValue([resolvedAlert, resolvedAlertB]);
    vi.mocked(alertService.listNotes)
      .mockReturnValueOnce(notesA.promise)
      .mockReturnValueOnce(notesB.promise);

    render(<AlertsPage />);

    const buttons = await screen.findAllByRole("button", { name: "메모 보기" });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    notesB.resolve([{ id: "note-b", type: "MEMO", note: "B 메모", createdBy: "staff-1", authorRole: "STAFF", createdAt: "2026-07-03T00:05:00.000Z" }]);
    await screen.findByText("B 메모");
    notesA.resolve([{ id: "note-a", type: "MEMO", note: "A 메모", createdBy: "staff-1", authorRole: "STAFF", createdAt: "2026-07-03T00:05:00.000Z" }]);

    await waitFor(() => expect(screen.queryByText("A 메모")).toBeNull());
    expect(screen.getByRole("dialog", { name: "202호 메모 히스토리" })).toBeTruthy();
  });

  it("shows a notes error instead of an empty history after a notes request fails", async () => {
    const { alertService } = await import("@/services/alertService");
    vi.mocked(alertService.listNotes).mockRejectedValueOnce(new Error("메모를 불러오지 못했습니다."));

    render(<AlertsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "메모 보기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("메모를 불러오지 못했습니다.");
    expect(screen.queryByText("저장된 메모가 없습니다.")).toBeNull();
  });

  it("traps focus in the notes modal and restores it to the trigger on close", async () => {
    const { rerender } = render(<AlertsPage />);
    const trigger = await screen.findByRole("button", { name: "메모 보기" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "201호 메모 히스토리" });
    const closeButton = screen.getByRole("button", { name: "닫기" });

    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);
    closeButton.focus();
    fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    rerender(<AlertsPage />);
    const reopenedTrigger = await screen.findByRole("button", { name: "메모 보기" });
    fireEvent.click(reopenedTrigger);
    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(reopenedTrigger);
  });
});

describe("확인됨 목록은 해결 경로를 안내한다", () => {
  async function svc() {
    const { alertService } = await import("@/services/alertService");
    return alertService;
  }

  it("확인된 알림이 있으면 조치 기록을 어디서 남기는지 알려준다", async () => {
    // 이 화면에는 메모 작성 UI가 없다. 안내가 없으면 '해결 완료'를 눌러도
    // 거부만 반복되고 어디로 가야 할지 알 수 없는 막다른 길이 된다.
    const alertService = await svc();
    vi.mocked(alertService.listRecent).mockResolvedValue([
      { ...resolvedAlert, id: "alert-acked", status: "ACKED" } as AlertView,
    ]);

    render(<AlertsPage />);

    expect(
      await screen.findByText(/기록은 현황판에서 방을 눌러 남길 수 있습니다/),
    ).toBeTruthy();
  });

  it("확인된 알림이 없으면 안내를 띄우지 않는다", async () => {
    const alertService = await svc();
    vi.mocked(alertService.listRecent).mockResolvedValue([resolvedAlert]);

    render(<AlertsPage />);

    await screen.findByText("확인된 알림이 없습니다.");
    expect(screen.queryByText(/기록은 현황판에서/)).toBeNull();
  });
});
