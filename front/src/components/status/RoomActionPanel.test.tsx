import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomActionPanel, eventGroupsFor } from "./RoomActionPanel";
import type { DetectionEvent, Space, SpaceStatus } from "@/types";
import { formatDateTime } from "@/lib/format";
import type { AlertNote } from "@/services/alertService";

vi.mock("@/services/alertService", () => ({
  alertService: {
    resolve: vi.fn(async () => ({})),
    acknowledge: vi.fn(async () => ({})),
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
    connection: "LIVE",
    lastSeenAt: "2026-08-03T11:59:30.000Z",
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
  vi.mocked(alertService.acknowledge).mockClear();
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
    await waitFor(() => expect(alertService.acknowledge).toHaveBeenCalledWith("fall-2"));
    expect(alertService.acknowledge).not.toHaveBeenCalledWith("alert-a");
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

    await waitFor(() => expect(alertService.acknowledge).toHaveBeenCalledTimes(2));
    expect(alertService.acknowledge).toHaveBeenCalledWith("fall-1");
    expect(alertService.acknowledge).toHaveBeenCalledWith("fall-2");
    expect(alertService.acknowledge).not.toHaveBeenCalledWith("bed-1");
  });
  it("pages alert groups by 20 rows and collapses back to five rows", () => {
    const alerts = Array.from({ length: 30 }, (_, index) =>
      alert({
        id: `fall-${index}`,
        aiSummary: `낙상 ${index}`,
        detectedAt: `2026-07-03T00:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );

    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "더 보기 (25)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "더 보기 (25)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    expect(screen.getByRole("button", { name: "더 보기 (5)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "접기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "더 보기 (5)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "더 보기 (25)" })).toBeTruthy();
  });

  it("resolves every alert in a group even when most rows are collapsed", async () => {
    const alerts = Array.from({ length: 8 }, (_, index) =>
      alert({ id: `fall-${index}`, aiSummary: `낙상 ${index}`, detectedAt: `2026-07-03T00:0${index}:00.000Z` }),
    );
    const { alertService } = await import("@/services/alertService");
    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={alerts} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "그룹 확인" }));

    await waitFor(() => expect(alertService.acknowledge).toHaveBeenCalledTimes(8));
    for (const item of alerts) expect(alertService.acknowledge).toHaveBeenCalledWith(item.id);
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

  it("renders each alert's formatted detected time", () => {
    const detectedAt = "2026-07-03T00:00:00.000Z";
    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert({ detectedAt })]} onClose={vi.fn()} />);

    expect(screen.getByText(formatDateTime(detectedAt))).toBeTruthy();
  });

  it("does not fabricate actionable groups from stale status flags", () => {
    const alertStatus = { ...status("a", "DANGER"), bedsideActivity: true, soloMovementAttempt: true };
    expect(eventGroupsFor(alertStatus)).toEqual([]);
  });

  it("explains that saving a memo does not clear the alarm", () => {
    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={vi.fn()} />);

    expect(screen.getByText(/알림을 받았다고 알리세요/)).toBeTruthy();
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

  it("traps focus in the modal and restores it to the opener when closed", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    render(<RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "201호" });
    const closeButton = screen.getByRole("button", { name: "모달 닫기" });
    const resolveButton = screen.getByRole("button", { name: "해결 완료" });
    expect(document.activeElement).toBe(dialog);

    resolveButton.focus();
    fireEvent.keyDown(resolveButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(resolveButton);

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it("restores the original opener after rerendering with a new close handler in StrictMode", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const initialOnClose = vi.fn();
    const latestOnClose = vi.fn();
    const panel = (
      <StrictMode>
        <RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={initialOnClose} />
      </StrictMode>
    );
    const { rerender } = render(panel);

    const closeButton = screen.getByRole("button", { name: "모달 닫기" });
    closeButton.focus();
    rerender(
      <StrictMode>
        <RoomActionPanel space={spaces[1]} status={status("a", "DANGER")} alerts={[alert()]} onClose={latestOnClose} />
      </StrictMode>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(initialOnClose).not.toHaveBeenCalled();
    expect(latestOnClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    opener.remove();
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

    const resolveButton = screen.getByRole("button", { name: "확인" }) as HTMLButtonElement;
    expect(resolveButton.disabled).toBe(true);
    fireEvent.click(resolveButton);
    expect(alertService.acknowledge).not.toHaveBeenCalled();
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

describe("해결 완료 실패를 침묵으로 넘기지 않는다", () => {
  async function svc() {
    const { alertService } = await import("@/services/alertService");
    return alertService;
  }

  function renderPanel(onResolved = vi.fn()) {
    render(
      <RoomActionPanel
        space={spaces[1]}
        status={status("a", "DANGER")}
        alerts={[alert({ id: "event-1" })]}
        onClose={vi.fn()}
        onResolved={onResolved}
      />,
    );
    return onResolved;
  }

  it("서버가 조치 기록 없이 거부하면 사유를 화면에 띄운다", async () => {
    // I4로 백엔드가 메모 없는 해결을 거부한다. catch가 없으면 요양보호사는
    // 눌렀는데 아무 일도 안 일어나는 것을 보고 처리됐다고 믿는다.
    const alertService = await svc();
    const { ApiError } = await import("@/services/apiClient");
    vi.mocked(alertService.resolve).mockRejectedValueOnce(
      // 실제 Nest 응답 형태(JSON 본문)를 그대로 흉내낸다.
      new ApiError(
        400,
        JSON.stringify({
          statusCode: 400,
          message: "조치 결과를 먼저 기록해야 해결 완료로 바꿀 수 있습니다.",
        }),
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "해결 완료" }));

    const nodes = await screen.findAllByRole("alert");
    expect(
      nodes.some((n) => (n.textContent ?? "").includes("조치 결과를 먼저 기록")),
    ).toBe(true);
  });

  it("네트워크 오류도 문구로 알린다", async () => {
    const alertService = await svc();
    vi.mocked(alertService.resolve).mockRejectedValueOnce(new Error("network down"));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "해결 완료" }));

    const nodes = await screen.findAllByRole("alert");
    expect(
      nodes.some((n) => (n.textContent ?? "").includes("해결 완료로 바꾸지 못했습니다")),
    ).toBe(true);
  });

  it("성공하면 오류 문구가 남지 않는다", async () => {
    const alertService = await svc();
    vi.mocked(alertService.resolve).mockResolvedValueOnce({} as never);

    const onResolved = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "해결 완료" }));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(screen.queryByText(/해결 완료로 바꾸지 못했습니다/)).toBeNull();
  });
});

describe("확인(ACK)과 해결 완료(RESOLVE)는 다른 동작이다 (I4)", () => {
  async function svc() {
    const { alertService } = await import("@/services/alertService");
    return alertService;
  }

  function renderPanel() {
    render(
      <RoomActionPanel
        space={spaces[1]}
        status={status("a", "DANGER")}
        alerts={[alert({ id: "event-1" })]}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );
  }

  it("확인은 메모 없이도 눌리고 ACK만 호출한다", async () => {
    // TV 앞에서 타이핑하기 전에 "내가 간다"를 먼저 알려야 한다.
    const alertService = await svc();
    vi.mocked(alertService.resolve).mockClear();
    vi.mocked(alertService.acknowledge).mockClear();
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(alertService.acknowledge).toHaveBeenCalledWith("event-1"));
    expect(alertService.resolve).not.toHaveBeenCalled();
  });

  it("해결 완료는 RESOLVE를 호출한다", async () => {
    const alertService = await svc();
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "해결 완료" }));

    await waitFor(() => expect(alertService.resolve).toHaveBeenCalledWith("event-1"));
  });

  it("이미 확인된 알림만 있으면 확인 버튼이 비활성이다", () => {
    render(
      <RoomActionPanel
        space={spaces[1]}
        status={status("a", "DANGER")}
        alerts={[alert({ id: "event-1", alertStatus: "ACKNOWLEDGED" })]}
        onClose={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "확인" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("확인 후에도 패널이 열려 있어 메모를 이어서 쓸 수 있다", async () => {
    // 확인 → 방문 → 기록 → 해결 완료가 한 흐름이다. 확인에서 패널이 닫히면
    // 요양보호사가 다시 찾아 들어와야 하고, 그 사이 기록이 누락된다.
    const alertService = await svc();
    vi.mocked(alertService.acknowledge).mockClear();
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(alertService.acknowledge).toHaveBeenCalled());

    // 메모 입력과 해결 완료가 그대로 남아 있다.
    expect(screen.getByPlaceholderText("조치 내용을 입력하세요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "해결 완료" })).toBeTruthy();
  });
});
