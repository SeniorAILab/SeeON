import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { connectionChipLabel, useDebouncedStatuses } from "./RoomStatusBoard";
import { groupRoomsByFloor } from "./RoomStatusTreemap";
import { textFor } from "@/services/tts/audioMap";
import { FloorMonitorPage } from "@/pages/monitor/FloorMonitorPage";
import type { Floor, Space, SpaceStatus } from "@/types";

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
