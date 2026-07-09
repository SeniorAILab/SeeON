import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomActionPanel, eventGroupsFor } from "./RoomActionPanel";
import type { DetectionEvent, Space, SpaceStatus } from "@/types";
import type { AlertNote } from "@/services/alertService";

vi.mock("@/services/alertService", () => ({
  alertService: {
    resolveAlertById: vi.fn(async () => ({})),
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
  vi.mocked(alertService.resolveAlertById).mockClear();
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
    await waitFor(() => expect(alertService.resolveAlertById).toHaveBeenCalledWith("fall-2"));
    expect(alertService.resolveAlertById).not.toHaveBeenCalledWith("alert-a");
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

    await waitFor(() => expect(alertService.resolveAlertById).toHaveBeenCalledTimes(2));
    expect(alertService.resolveAlertById).toHaveBeenCalledWith("fall-1");
    expect(alertService.resolveAlertById).toHaveBeenCalledWith("fall-2");
    expect(alertService.resolveAlertById).not.toHaveBeenCalledWith("bed-1");
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
});
