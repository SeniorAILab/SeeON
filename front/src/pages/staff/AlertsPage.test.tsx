import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsPage } from "./AlertsPage";
import type { AlertView } from "@/types";

vi.mock("@/services/alertService", () => ({
  alertService: {
    listRecent: vi.fn(),
    acknowledge: vi.fn(),
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

describe("확인/해결은 메모 없이 버튼 하나로 끝난다", () => {
  async function svc() {
    const { alertService } = await import("@/services/alertService");
    return alertService;
  }

  it("확인됨 카드는 텍스트 입력 없이 '현장 확인 완료' 버튼 하나만 보여준다", async () => {
    const alertService = await svc();
    vi.mocked(alertService.listRecent).mockResolvedValue([
      { ...resolvedAlert, id: "alert-acked", status: "ACKED", type: "fall" } as AlertView,
    ]);

    render(<AlertsPage />);

    expect(await screen.findByRole("button", { name: "현장 확인 완료" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/메모/)).toBeNull();
  });

  it("'현장 확인 완료'를 누르면 메모 없이 곧바로 resolve를 호출한다", async () => {
    const alertService = await svc();
    vi.mocked(alertService.listRecent).mockResolvedValue([
      { ...resolvedAlert, id: "alert-acked", status: "ACKED", type: "fall" } as AlertView,
    ]);
    vi.mocked(alertService.resolve).mockResolvedValue({
      ...resolvedAlert,
      id: "alert-acked",
      status: "RESOLVED",
    } as AlertView);

    render(<AlertsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "현장 확인 완료" }));

    await waitFor(() => expect(alertService.resolve).toHaveBeenCalledWith("alert-acked"));
  });
});

describe("이벤트 유형 표시", () => {
  async function svc() {
    const { alertService } = await import("@/services/alertService");
    return alertService;
  }

  it("등록된 유형은 한글 제목으로 보이고 원문 코드가 새지 않는다", async () => {
    const alertService = await svc();
    vi.mocked(alertService.listRecent).mockResolvedValue([
      { ...resolvedAlert, id: "alert-new", status: "NEW", type: "bed-exit" } as AlertView,
    ]);

    render(<AlertsPage />);

    expect(await screen.findByText("침대 이탈")).toBeTruthy();
    expect(screen.queryByText("bed-exit")).toBeNull();
  });

  it("등록되지 않은 유형은 원문 대신 '새 안전 알림'으로 안전하게 표시된다", async () => {
    const alertService = await svc();
    vi.mocked(alertService.listRecent).mockResolvedValue([
      { ...resolvedAlert, id: "alert-new", status: "NEW", type: "some-future-type" } as AlertView,
    ]);

    render(<AlertsPage />);

    expect(await screen.findByText("새 안전 알림")).toBeTruthy();
    expect(screen.queryByText("some-future-type")).toBeNull();
  });
});

describe("카드마다 주요 동작은 정확히 하나다", () => {
  it("NEW 카드는 '확인하러 갑니다' 버튼만, ACKED 카드는 '현장 확인 완료' 버튼만 갖는다", async () => {
    const { alertService } = await import("@/services/alertService");
    vi.mocked(alertService.listRecent).mockResolvedValue([
      { ...resolvedAlert, id: "alert-new", status: "NEW", type: "fall" } as AlertView,
      { ...resolvedAlert, id: "alert-acked", status: "ACKED", type: "fall" } as AlertView,
    ]);

    render(<AlertsPage />);

    const newButtons = await screen.findAllByRole("button", { name: "확인하러 갑니다" });
    const ackButtons = screen.getAllByRole("button", { name: "현장 확인 완료" });
    expect(newButtons).toHaveLength(1);
    expect(ackButtons).toHaveLength(1);
    // NEW 카드에는 해결 버튼이, ACKED 카드에는 확인 버튼이 없어야 한다.
    expect(screen.queryByRole("button", { name: "메모 보기" })).toBeNull();
  });
});

describe("대량 알림 렌더링", () => {
  it("알림이 많아도(200건) 오류 없이 렌더링된다", async () => {
    const { alertService } = await import("@/services/alertService");
    const many: AlertView[] = Array.from({ length: 200 }, (_, i) => ({
      ...resolvedAlert,
      id: `alert-${i}`,
      status: i % 3 === 0 ? "NEW" : i % 3 === 1 ? "ACKED" : "RESOLVED",
      type: i % 2 === 0 ? "fall" : "bed-exit",
      room: `${100 + i}호`,
    }) as AlertView);
    vi.mocked(alertService.listRecent).mockResolvedValue(many);

    render(<AlertsPage />);

    await screen.findByRole("heading", { name: "확인 필요" });
    const newCount = many.filter((a) => a.status === "NEW").length;
    expect((await screen.findAllByRole("button", { name: "확인하러 갑니다" }))).toHaveLength(newCount);
  });
});

describe("완료 조건 ⑤: 큰 버튼 두 번으로 처리", () => {
  /** 매 상태마다 화면에 텍스트 입력 수단이 하나도 없어야 한다 — 메모는 선택, 필수가 아니다. */
  function expectNoTextInputAnywhere(container: HTMLElement) {
    expect(container.querySelectorAll("input, textarea, [contenteditable]")).toHaveLength(0);
  }

  it("새 알림을 텍스트 입력 없이 큰 버튼 두 번만으로 해결 상태까지 처리한다", async () => {
    const { alertService } = await import("@/services/alertService");

    const base = { id: "alert-e2e", room: "310호", type: "fall", detectedAt: "2026-07-03T00:00:00.000Z" };
    const newAlert = { ...base, status: "NEW" } as AlertView;
    const ackedAlert = {
      ...base,
      status: "ACKED",
      ackedByName: "요양보호사",
      ackedAt: "2026-07-03T00:01:00.000Z",
    } as AlertView;
    const resolvedFromFlow = {
      ...base,
      status: "RESOLVED",
      ackedByName: "요양보호사",
      ackedAt: "2026-07-03T00:01:00.000Z",
      resolvedByName: "요양보호사",
      resolvedAt: "2026-07-03T00:02:00.000Z",
    } as AlertView;

    // acknowledge/resolve는 파일 전역에서 공유되는 mock이라 앞선 테스트의 호출 횟수가
    // 남아있다 — 이 흐름이 "정확히 두 번"인지 보려면 이 테스트만의 호출 횟수여야 한다.
    vi.mocked(alertService.acknowledge).mockClear();
    vi.mocked(alertService.resolve).mockClear();

    // acknowledge/resolve 각각이 성공한 뒤 AlertsPage는 목록을 다시 불러온다(runAction → load).
    // 세 번의 listRecent 호출이 NEW → ACKED → RESOLVED 각 단계의 화면 상태를 만든다.
    vi.mocked(alertService.listRecent)
      .mockResolvedValueOnce([newAlert])
      .mockResolvedValueOnce([ackedAlert])
      .mockResolvedValueOnce([resolvedFromFlow]);
    vi.mocked(alertService.acknowledge).mockResolvedValue(ackedAlert);
    vi.mocked(alertService.resolve).mockResolvedValue(resolvedFromFlow);

    const { container } = render(<AlertsPage />);

    // --- 상태 1: NEW. 카드의 주요 동작은 "확인하러 갑니다" 하나뿐이다. ---
    const firstPress = await screen.findByRole("button", { name: "확인하러 갑니다" });
    expect(screen.queryByRole("button", { name: "현장 확인 완료" })).toBeNull();
    expect(screen.queryByRole("button", { name: "메모 보기" })).toBeNull();
    expect(firstPress.className).toContain("min-h-[56px]");
    expectNoTextInputAnywhere(container);

    // --- 누름 1/2 ---
    fireEvent.click(firstPress);
    await waitFor(() => expect(alertService.acknowledge).toHaveBeenCalledWith("alert-e2e"));

    // --- 상태 2: ACKED. 이제 주요 동작은 "현장 확인 완료" 하나뿐 — 방금 눌렀던 버튼과
    // 경쟁하는 primary가 동시에 남아있지 않다. ---
    const secondPress = await screen.findByRole("button", { name: "현장 확인 완료" });
    expect(screen.queryByRole("button", { name: "확인하러 갑니다" })).toBeNull();
    expect(screen.queryByRole("button", { name: "메모 보기" })).toBeNull();
    expect(secondPress.className).toContain("min-h-[56px]");
    expectNoTextInputAnywhere(container);

    // --- 누름 2/2 ---
    fireEvent.click(secondPress);
    await waitFor(() => expect(alertService.resolve).toHaveBeenCalledWith("alert-e2e"));

    // --- 상태 3: RESOLVED. 정확히 두 번의 버튼 입력만으로 도달했다. ---
    await screen.findByRole("button", { name: "메모 보기" });
    expect(screen.queryByRole("button", { name: "확인하러 갑니다" })).toBeNull();
    expect(screen.queryByRole("button", { name: "현장 확인 완료" })).toBeNull();
    expect(alertService.acknowledge).toHaveBeenCalledTimes(1);
    expect(alertService.resolve).toHaveBeenCalledTimes(1);
    // "메모 보기"는 조회 전용 secondary다 — 열지 않아도 이미 RESOLVED에 도달해 있고,
    // 흐름을 완료하는 데 텍스트 입력 수단은 어디에도 필요하지 않았다.
    expectNoTextInputAnywhere(container);
  });
});
