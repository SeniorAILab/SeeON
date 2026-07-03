import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineActionPanel, eventGroupsFor } from "@/components/monitor/InlineActionPanel";
import { connectionChipLabel, useDebouncedStatuses } from "./RoomStatusBoard";
import { groupRoomsByFloor } from "./RoomStatusTreemap";
import { textFor } from "@/services/tts/audioMap";
import { FloorMonitorPage } from "@/pages/monitor/FloorMonitorPage";
import type { DetectionEvent, Floor, Space, SpaceStatus } from "@/types";
import type { AlertNote } from "@/services/api/alertNotes";

vi.mock("@/services/api/alertEndpoints", () => ({
  resolveAlert: vi.fn(async () => ({})),
}));
vi.mock("@/services/api/alertNotes", () => ({
  createAlertNote: vi.fn(async () => ({
    id: "note-new",
    type: "MEMO",
    note: "저장한 메모",
    createdBy: "staff-1",
    authorRole: "STAFF",
    createdAt: "2026-07-03T00:01:00.000Z",
  })),
  listAlertNotes: vi.fn(async () => []),
}));


const spaces: Space[] = [
  { id: "b", facilityId: "fac", floorId: "2", name: "202호", type: "ROOM", capacity: 2, isActive: true },
  { id: "a", facilityId: "fac", floorId: "2", name: "201호", type: "ROOM", capacity: 2, isActive: true },
  { id: "c", facilityId: "fac", floorId: "3", name: "301호", type: "ROOM", capacity: 2, isActive: true },
];

const floors: Floor[] = [
  { id: "2", facilityId: "fac", name: "2F", orderIndex: 2 },
  { id: "3", facilityId: "fac", name: "3F", orderIndex: 3 },
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
    kakaoAlertStatus: "PENDING",
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
    kakaoAlertStatus: "PENDING",
    actions: [],
    ...overrides,
  };
}


describe("RoomStatusBoard floor grid helpers", () => {
  it("groups by floor order and sorts rooms by severity then numeric name", () => {
    const mixedSpaces: Space[] = [
      ...spaces,
      { id: "d", facilityId: "fac", floorId: "2", name: "203호", type: "ROOM", capacity: 2, isActive: true },
      { id: "e", facilityId: "fac", floorId: "2", name: "101호", type: "ROOM", capacity: 2, isActive: true },
    ];
    const groups = groupRoomsByFloor(mixedSpaces, { a: status("a", "DANGER"), b: status("b", "STABLE"), c: status("c", "CAUTION"), d: status("d", "CHECK_NEEDED"), e: status("e", "DANGER") }, floors);

    expect(groups.map((group) => group.floorName)).toEqual(["2F", "3F"]);
    expect(groups[0].rooms.map((room) => room.id)).toEqual(["e", "a", "d", "b"]);
    expect(groups[1].rooms.map((room) => room.id)).toEqual(["c"]);
  });

  it("counts danger and check-needed rooms as floor events", () => {
    const groups = groupRoomsByFloor(spaces, { a: status("a", "DANGER"), b: status("b", "CHECK_NEEDED"), c: status("c", "CAUTION") }, floors);

    expect(groups.map((group) => [group.floorName, group.alertCount])).toEqual([
      ["2F", 2],
      ["3F", 0],
    ]);
  });

  it("places spaces with missing floor metadata after known floors", () => {
    const unknownFloorSpace = { id: "x", facilityId: "fac", floorId: "9", name: "901호", type: "ROOM" as const, capacity: 1, isActive: true };
    const groups = groupRoomsByFloor([...spaces, unknownFloorSpace], { x: status("x", "DANGER") }, floors);

    expect(groups.map((group) => [group.floorName, group.floor?.id ?? null])).toEqual([
      ["2F", "2"],
      ["3F", "3"],
      ["9", null],
    ]);
    expect(groups[2].rooms.map((room) => room.id)).toEqual(["x"]);
  });

  it("formats connection chip from real values", () => {
    expect(connectionChipLabel("NORMAL", "2026-07-03T00:00:00.000Z", new Date("2026-07-03T00:00:07.000Z").getTime())).toBe("정상 연결 · 7초 전 갱신");
    expect(connectionChipLabel("RECONNECTING", null)).toBe("재연결 중");
    expect(connectionChipLabel("DELAYED", null)).toBe("데이터 지연");
  });
});

beforeEach(async () => {
  const { resolveAlert } = await import("@/services/api/alertEndpoints");
  const { createAlertNote, listAlertNotes } = await import("@/services/api/alertNotes");
  vi.mocked(resolveAlert).mockClear();
  vi.mocked(createAlertNote).mockClear();
  vi.mocked(listAlertNotes).mockReset();
  vi.mocked(listAlertNotes).mockResolvedValue([]);
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


describe("InlineActionPanel", () => {
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
    const { resolveAlert } = await import("@/services/api/alertEndpoints");
    const onResolved = vi.fn();
    render(<InlineActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} onResolved={onResolved} />);
    fireEvent.click(screen.getAllByRole("button", { name: "개별 확인" })[1]);
    await waitFor(() => expect(resolveAlert).toHaveBeenCalledWith("fall-2"));
    expect(resolveAlert).not.toHaveBeenCalledWith("alert-a");
    expect(onResolved).toHaveBeenCalled();
  });

  it("resolves only the alert ids in the clicked event group", async () => {
    const alerts = [
      alert({ id: "fall-1", eventType: "FALL_RISK", aiSummary: "낙상 1" }),
      alert({ id: "fall-2", eventType: "FALL_RISK", aiSummary: "낙상 2" }),
      alert({ id: "bed-1", eventType: "BED_EXIT", aiSummary: "침대 이탈" }),
    ];
    const { resolveAlert } = await import("@/services/api/alertEndpoints");
    render(<InlineActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: "그룹 확인" })[0]);

    await waitFor(() => expect(resolveAlert).toHaveBeenCalledTimes(2));
    expect(resolveAlert).toHaveBeenCalledWith("fall-1");
    expect(resolveAlert).toHaveBeenCalledWith("fall-2");
    expect(resolveAlert).not.toHaveBeenCalledWith("bed-1");
  });

  it("keeps collapsed status fallback but does not require it for real alert grouping", () => {
    const alertStatus = { ...status("a", "DANGER"), bedsideActivity: true, soloMovementAttempt: true };
    expect(eventGroupsFor(alertStatus).map((group) => group.label)).toEqual(["낙상 위험", "침대 주변 활동", "단독 이동 시도"]);
  });
  it("renders as a modal dialog and closes from Escape, backdrop, and close button", () => {
    const onClose = vi.fn();
    const { rerender } = render(<InlineActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "201호" }).getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<InlineActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "모달 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<InlineActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("dialog", { name: "201호" }).parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("targets the real alert id (not the synthetic status id) and reloads note history", async () => {
    const { createAlertNote, listAlertNotes } = await import("@/services/api/alertNotes");
    vi.mocked(listAlertNotes)
      .mockResolvedValueOnce([note({ note: "기존 메모" })])
      .mockResolvedValueOnce([note({ note: "기존 메모" }), note({ id: "note-2", note: "저장한 메모", authorRole: "ADMIN", createdAt: "2026-07-03T00:02:00.000Z" })]);

    render(<InlineActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert({ id: "event-1" })]} onClose={vi.fn()} />);

    expect(await screen.findByText("기존 메모")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("메모"), { target: { value: "저장한 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));

    await waitFor(() => expect(createAlertNote).toHaveBeenCalledWith("event-1", "저장한 메모"));
    await waitFor(() => expect(listAlertNotes).toHaveBeenLastCalledWith("event-1"));
    expect(await screen.findByText("저장한 메모")).toBeTruthy();
    expect(screen.getByText(/ADMIN/)).toBeTruthy();
  });

  it("uses the first alert id for notes when status id is absent", async () => {
    const { createAlertNote, listAlertNotes } = await import("@/services/api/alertNotes");
    render(<InlineActionPanel space={spaces[1]} alerts={[alert({ id: "event-1" })]} onClose={vi.fn()} />);

    await waitFor(() => expect(listAlertNotes).toHaveBeenCalledWith("event-1"));
    fireEvent.change(screen.getByLabelText("메모"), { target: { value: "알림 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "메모 저장" }));

    await waitFor(() => expect(createAlertNote).toHaveBeenCalledWith("event-1", "알림 메모"));
  });

  it("disables note writing when the room has no current alert event", async () => {
    const { createAlertNote, listAlertNotes } = await import("@/services/api/alertNotes");
    render(<InlineActionPanel space={spaces[1]} alerts={[]} onClose={vi.fn()} />);

    expect(screen.getByText("현재 기록할 이벤트가 없습니다.")).toBeTruthy();
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "메모 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(createAlertNote).not.toHaveBeenCalled();
    expect(listAlertNotes).not.toHaveBeenCalled();
  });
});

describe("TTS", () => {
  it("uses the fixed spoken template", () => {
    expect(textFor("201호", "danger")).toBe("201호에서 위험 발생, 확인이 필요합니다");
  });
  it("exposes only the fixed spoken template from the runtime audio map", async () => {
    const audioMap = await import("@/services/tts/audioMap");
    const ttsConfig = await import("@/services/tts/ttsConfig");
    expect(textFor("201호", "danger")).toBe("201호에서 위험 발생, 확인이 필요합니다");
    expect("summaryMessage" in ttsConfig).toBe(false);
    expect("COMMON_SLUGS" in ttsConfig).toBe(false);
    expect("LEVELS_BY_CATEGORY" in ttsConfig).toBe(false);
    expect("audioPathFor" in audioMap).toBe(false);
    expect("MANIFEST_PATH" in audioMap).toBe(false);
    expect("summaryPath" in audioMap).toBe(false);
  });
  it("keeps staff monitor source free of exit/video copy", () => {
    const source = String.raw`${FloorMonitorPage}`;
    expect(source).not.toContain("나가기");
    expect(source).not.toContain("영상");
    expect(source).not.toContain("관리자만");
  });
});

describe("useDebouncedStatuses", () => {
  it("applies rapid changes once after debounce", () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    function Probe({ statuses }: { statuses: Record<string, SpaceStatus> }) {
      const debounced = useDebouncedStatuses(spaces, statuses, 2000);
      seen.push(debounced.a?.status ?? "none");
      return null;
    }
    const { rerender } = render(<Probe statuses={{ a: status("a", "STABLE") }} />);
    rerender(<Probe statuses={{ a: status("a", "CAUTION") }} />);
    rerender(<Probe statuses={{ a: status("a", "DANGER") }} />);
    act(() => vi.advanceTimersByTime(1999));
    expect(seen.at(-1)).toBe("STABLE");
    act(() => vi.advanceTimersByTime(1));
    expect(seen.at(-1)).toBe("DANGER");
    vi.useRealTimers();
  });
});
