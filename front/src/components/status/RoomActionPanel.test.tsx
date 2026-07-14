import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomActionPanel, eventGroupsFor } from "./RoomActionPanel";
import type { DetectionEvent, Space, SpaceStatus } from "@/types";
import type { AlertNote } from "@/services/alertService";
import { formatDateTime } from "@/lib/format";

vi.mock("@/services/alertService", () => ({
  alertService: {
    resolve: vi.fn(async () => ({})),
    createNote: vi.fn(async () => ({
      id: "note-new",
      type: "MEMO",
      note: "저장한 메모",
      createdBy: "staff-1",
      authorRole: "STAFF",
      createdAt: "2026-07-03T00:01:00.000Z",
    })),
    listNotes: vi.fn(async () => []),
  },
}));

const spaces: Space[] = [
  { id: "b", facilityId: "fac", floorId: "2", name: "202호", type: "ROOM", capacity: 2, isActive: true },
  { id: "a", facilityId: "fac", floorId: "2", name: "201호", type: "ROOM", capacity: 2, isActive: true },
  { id: "c", facilityId: "fac", floorId: "3", name: "301호", type: "ROOM", capacity: 2, isActive: true },
];

function status(id: string, level: SpaceStatus["status"]): SpaceStatus {
  return {
    id: `alert-${id}`,
    spaceId: id,
    peopleCount: 1,
    movementLevel: "LOW",
    fallRiskLevel: level === "DANGER" ? "HIGH" : "LOW",
    status: level,
    aiSummary: "확인이 필요합니다.",
    lastDetectedAt: "2026-07-03T00:00:00.000Z",
    alertStatus: "PENDING",
  };
}

function alert(overrides: Partial<DetectionEvent> = {}): DetectionEvent {
  return {
    id: "alert-a",
    facilityId: "fac",
    spaceId: "a",
    eventType: "FALL_RISK",
    riskLevel: "HIGH",
    message: "낙상 위험",
    aiSummary: "낙상 위험이 감지되었습니다.",
    detectedAt: "2026-07-03T00:00:00.000Z",
    alertStatus: "PENDING",
    actions: [],
    ...overrides,
  };
}

beforeEach(async () => {
  const { alertService } = await import("@/services/alertService");
  vi.mocked(alertService.resolve).mockClear();
  vi.mocked(alertService.createNote).mockClear();
  vi.mocked(alertService.listNotes).mockReset();
  vi.mocked(alertService.listNotes).mockResolvedValue([]);
});

function note(overrides: Partial<AlertNote> = {}): AlertNote {
  return {
    id: "note-1",
    type: "MEMO",
    note: "기존 메모",
    createdBy: "staff-1",
    authorRole: "STAFF",
    createdAt: "2026-07-03T00:00:30.000Z",
    ...overrides,
  };
}

describe("RoomActionPanel", () => {
  it("groups real room alerts by event type and resolves individual alerts", async () => {
    const alerts = [
      alert({ id: "fall-1", eventType: "FALL_RISK", aiSummary: "낙상 1" }),
      alert({ id: "fall-2", eventType: "FALL_RISK", aiSummary: "낙상 2" }),
      alert({ id: "bed-1", eventType: "BED_EXIT", aiSummary: "침대 이탈" }),
    ];
    expect(eventGroupsFor(status("a", "DANGER"), alerts).map((group) => [group.label, group.count])).toEqual([
      ["낙상 위험", 2],
      ["침대 이탈", 1],
    ]);
    const { alertService } = await import("@/services/alertService");
    const onResolved = vi.fn();
    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} onResolved={onResolved} />);
    fireEvent.click(screen.getAllByRole("button", { name: "개별 확인" })[1]);
    await waitFor(() => expect(alertService.resolve).toHaveBeenCalledWith("fall-2"));
    expect(alertService.resolve).not.toHaveBeenCalledWith("alert-a");
    expect(onResolved).toHaveBeenCalled();
  });

  it("resolves only the alert ids in the clicked event group", async () => {
    const alerts = [
      alert({ id: "fall-1", eventType: "FALL_RISK", aiSummary: "낙상 1" }),
      alert({ id: "fall-2", eventType: "FALL_RISK", aiSummary: "낙상 2" }),
      alert({ id: "bed-1", eventType: "BED_EXIT", aiSummary: "침대 이탈" }),
    ];
    const { alertService } = await import("@/services/alertService");
    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: "그룹 확인" })[0]);

    await waitFor(() => expect(alertService.resolve).toHaveBeenCalledTimes(2));
    expect(alertService.resolve).toHaveBeenCalledWith("fall-1");
    expect(alertService.resolve).toHaveBeenCalledWith("fall-2");
    expect(alertService.resolve).not.toHaveBeenCalledWith("bed-1");
  });
  it("shows five newest alert rows with times and expands the remaining group alerts", () => {
    const alerts = Array.from({ length: 8 }, (_, index) =>
      alert({
        id: `fall-${index}`,
        aiSummary: `낙상 ${index}`,
        detectedAt: `2026-07-03T00:0${index}:00.000Z`,
      }),
    );

    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "더 보기 (3)" })).toBeTruthy();
    for (let index = 7; index >= 3; index--) {
      expect(screen.getByText(formatDateTime(`2026-07-03T00:0${index}:00.000Z`))).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "더 보기 (3)" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "접기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("resolves every alert in a group even when most rows are collapsed", async () => {
    const alerts = Array.from({ length: 8 }, (_, index) =>
      alert({ id: `fall-${index}`, aiSummary: `낙상 ${index}`, detectedAt: `2026-07-03T00:0${index}:00.000Z` }),
    );
    const { alertService } = await import("@/services/alertService");
    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "그룹 확인" }));

    await waitFor(() => expect(alertService.resolve).toHaveBeenCalledTimes(8));
    for (const item of alerts) expect(alertService.resolve).toHaveBeenCalledWith(item.id);
  });

  it("renders the newest event first within each group", () => {
    const alerts = [
      alert({ id: "old", aiSummary: "오래된 알림", detectedAt: "2026-07-03T00:01:00.000Z" }),
      alert({ id: "new", aiSummary: "최신 알림", detectedAt: "2026-07-03T00:03:00.000Z" }),
      alert({ id: "middle", aiSummary: "중간 알림", detectedAt: "2026-07-03T00:02:00.000Z" }),
    ];

    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} />);

    expect(screen.getAllByRole("listitem")[0].textContent).toContain("최신 알림");
  });

  it("keeps collapsed status fallback but does not require it for real alert grouping", () => {
    const alertStatus = { ...status("a", "DANGER"), bedsideActivity: true, soloMovementAttempt: true };
    expect(eventGroupsFor(alertStatus).map((group) => group.label)).toEqual(["낙상 위험", "침대 주변 활동", "단독 이동 시도"]);
  });

  it("renders as a modal dialog and closes from Escape, backdrop, and close button", () => {
    const onClose = vi.fn();
    const { rerender } = render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "201호" }).getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "모달 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("dialog", { name: "201호" }).parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("uses the wide modal token and does not render gray disabled tokens", () => {
    const { container } = render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "201호" }).className).toContain("max-w-4xl");
    const classNames = [...container.querySelectorAll("*")].map((element) => element.className.toString());
    expect(classNames.some((className) => /gray-300/.test(className))).toBe(false);
  });

  it("targets the real alert id (not the synthetic status id) and reloads note history", async () => {
    const { alertService } = await import("@/services/alertService");
    vi.mocked(alertService.listNotes)
      .mockResolvedValueOnce([note({ note: "기존 메모" })])
      .mockResolvedValueOnce([note({ note: "기존 메모" }), note({ id: "note-2", note: "저장한 메모", authorRole: "ADMIN", createdAt: "2026-07-03T00:02:00.000Z" })]);

    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert({ id: "event-1" })]} onClose={vi.fn()} />);

    expect(await screen.findByText("기존 메모")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("메모"), { target: { value: "저장한 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));

    await waitFor(() => expect(alertService.createNote).toHaveBeenCalledWith("event-1", "저장한 메모"));
    await waitFor(() => expect(alertService.listNotes).toHaveBeenLastCalledWith("event-1"));
    expect(await screen.findByText("저장한 메모")).toBeTruthy();
    expect(screen.getByText(/ADMIN/)).toBeTruthy();
  });

  it("uses the first alert id for notes when status id is absent", async () => {
    const { alertService } = await import("@/services/alertService");
    render(<RoomActionPanel space={spaces[1]} alerts={[alert({ id: "event-1" })]} onClose={vi.fn()} />);

    await waitFor(() => expect(alertService.listNotes).toHaveBeenCalledWith("event-1"));
    fireEvent.change(screen.getByLabelText("메모"), { target: { value: "알림 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));

    await waitFor(() => expect(alertService.createNote).toHaveBeenCalledWith("event-1", "알림 메모"));
  });

  it("disables note writing when the room has no current alert event", async () => {
    const { alertService } = await import("@/services/alertService");
    render(<RoomActionPanel space={spaces[1]} alerts={[]} onClose={vi.fn()} />);

    expect(screen.getByText("현재 기록할 이벤트가 없습니다.")).toBeTruthy();
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "메모 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(alertService.createNote).not.toHaveBeenCalled();
    expect(alertService.listNotes).not.toHaveBeenCalled();
  });
  it("does not resolve a synthetic status id when no real alert exists", async () => {
    const { alertService } = await import("@/services/alertService");
    render(<RoomActionPanel space={spaces[1]} status={{ ...status("a", "DANGER"), id: "status-a" }} alerts={[]} onClose={vi.fn()} />);

    const resolveButton = screen.getByRole("button", { name: "확인완료" }) as HTMLButtonElement;
    expect(resolveButton.disabled).toBe(true);
    fireEvent.click(resolveButton);
    expect(alertService.resolve).not.toHaveBeenCalled();
  });
  it("keeps loaded memo history after the active alert is resolved", async () => {
    const { alertService } = await import("@/services/alertService");
    vi.mocked(alertService.listNotes).mockResolvedValue([note({ note: "해결 전 메모" })]);
    const { rerender } = render(
      <RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert({ id: "event-1" })]} onClose={vi.fn()} />,
    );

    expect(await screen.findByText("해결 전 메모")).toBeTruthy();
    rerender(<RoomActionPanel space={spaces[1]} status={status("a", "STABLE")} alerts={[]} onClose={vi.fn()} />);

    expect(screen.getByText("해결 전 메모")).toBeTruthy();
    expect(screen.queryByText("저장된 메모가 없습니다.")).toBeNull();
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).disabled).toBe(true);
    expect(alertService.listNotes).toHaveBeenCalledTimes(1);
  });
  it("keeps the viewed alert memo history when a sibling alert remains active", async () => {
    const { alertService } = await import("@/services/alertService");
    vi.mocked(alertService.listNotes).mockImplementation(async (alertId) =>
      alertId === "event-a" ? [note({ note: "A 메모" })] : [note({ note: "B 메모" })],
    );
    const { rerender } = render(
      <RoomActionPanel
        space={spaces[1]}
        status={status("a", "DANGER")}
        alerts={[alert({ id: "event-a" }), alert({ id: "event-b" })]}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("A 메모")).toBeTruthy();
    rerender(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert({ id: "event-b" })]} onClose={vi.fn()} />);

    expect(screen.getByText("A 메모")).toBeTruthy();
    expect(screen.queryByText("B 메모")).toBeNull();
    expect(alertService.listNotes).toHaveBeenCalledTimes(1);
  });
  it("does not retain space A notes when rerendered for space B without alerts", async () => {
    const { alertService } = await import("@/services/alertService");
    vi.mocked(alertService.listNotes).mockResolvedValue([note({ note: "201호 메모" })]);
    const { rerender } = render(
      <RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert({ id: "event-1" })]} onClose={vi.fn()} />,
    );

    expect(await screen.findByText("201호 메모")).toBeTruthy();
    rerender(<RoomActionPanel space={spaces[0]} status={status("b", "STABLE")} alerts={[]} onClose={vi.fn()} />);

    expect(screen.queryByText("201호 메모")).toBeNull();
    expect(screen.getByText("저장된 메모가 없습니다.")).toBeTruthy();
  });

  it("surfaces a visible error when note saving fails instead of swallowing it", async () => {
    const { alertService } = await import("@/services/alertService");
    const { ApiError } = await import("@/services/apiClient");
    vi.mocked(alertService.createNote).mockRejectedValueOnce(new ApiError(403, "Forbidden"));

    render(<RoomActionPanel space={spaces[1]} alerts={[alert({ id: "event-1" })]} onClose={vi.fn()} />);

    // 노트 로딩이 끝나 저장 버튼이 활성화될 때까지 대기
    expect(await screen.findByText("저장된 메모가 없습니다.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("메모"), { target: { value: "권한 없는 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));

    const alertBox = await screen.findByRole("alert");
    expect(alertBox.textContent).toContain("메모 작성 권한이 없습니다");
    // 입력값은 보존되어 재시도할 수 있어야 한다
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe("권한 없는 메모");

    vi.mocked(alertService.createNote).mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("메모 저장에 실패했습니다"));
  });
});
