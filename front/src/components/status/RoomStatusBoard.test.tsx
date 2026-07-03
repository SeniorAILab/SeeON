import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineActionPanel, eventGroupsFor } from "@/components/monitor/InlineActionPanel";
import { connectionChipLabel, useDebouncedStatuses } from "./RoomStatusBoard";
import { buildRoomTreemapLayout } from "./RoomStatusTreemap";
import { textFor } from "@/services/tts/audioMap";
import { FloorMonitorPage } from "@/pages/monitor/FloorMonitorPage";
import type { DetectionEvent, Space, SpaceStatus } from "@/types";

vi.mock("@/services/api/alertEndpoints", () => ({
  resolveAlert: vi.fn(async () => ({})),
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


describe("RoomStatusBoard treemap helpers", () => {
  it("keeps tile index order stable by floor and room name", () => {
    const rects = buildRoomTreemapLayout(spaces, { a: status("a", "DANGER"), b: status("b", "STABLE"), c: status("c", "CAUTION") }, 300, 200);
    expect(rects.map((rect) => rect.id)).toEqual(["a", "b", "c"]);
  });

  it("uses equal areas when every room has the same rank and preserves container area", () => {
    const rects = buildRoomTreemapLayout(spaces, Object.fromEntries(spaces.map((space) => [space.id, status(space.id, "STABLE")])), 300, 200);
    const areas = rects.map((rect) => Math.round(rect.width * rect.height));
    expect(new Set(areas).size).toBe(1);
    expect(Math.round(areas.reduce((sum, area) => sum + area, 0))).toBe(60_000);
  });

  it("does not define geometry transitions", () => {
    const source = String.raw`${buildRoomTreemapLayout}`;
    expect(source).not.toContain("transition");
  });

  it("formats connection chip from real values", () => {
    expect(connectionChipLabel("NORMAL", "2026-07-03T00:00:00.000Z", new Date("2026-07-03T00:00:07.000Z").getTime())).toBe("정상 연결 · 7초 전 갱신");
    expect(connectionChipLabel("RECONNECTING", null)).toBe("재연결 중");
    expect(connectionChipLabel("DELAYED", null)).toBe("데이터 지연");
  });
});

beforeEach(async () => {
  const { resolveAlert } = await import("@/services/api/alertEndpoints");
  vi.mocked(resolveAlert).mockClear();
});

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
