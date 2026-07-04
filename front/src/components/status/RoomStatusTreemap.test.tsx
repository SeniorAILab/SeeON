import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomStatusTreemap } from "./RoomStatusTreemap";
import type { Floor, Space, SpaceStatus } from "@/types";

const floors: Floor[] = [{ id: "2", facilityId: "fac", name: "2F", orderIndex: 2 }];

function space(id: string, name: string): Space {
  return { id, facilityId: "fac", floorId: "2", name, type: "ROOM", capacity: 1, isActive: true };
}

function status(spaceId: string, level: SpaceStatus["status"], aiSummary: string): SpaceStatus {
  return {
    id: `status-${spaceId}`,
    spaceId,
    peopleCount: 1,
    movementLevel: "LOW",
    fallRiskLevel: level === "DANGER" ? "HIGH" : "LOW",
    status: level,
    aiSummary,
    lastDetectedAt: "2026-07-04T00:00:00.000Z",
    kakaoAlertStatus: level === "STABLE" ? "NONE" : "PENDING",
  };
}

describe("RoomStatusTreemap aiSummary guard", () => {
  it("hides stale aiSummary residue on a STABLE tile without breaking the tile", () => {
    const stableSpace = space("stable-room", "201호");

    render(
      <RoomStatusTreemap
        spaces={[stableSpace]}
        floors={floors}
        statuses={{
          [stableSpace.id]: status(stableSpace.id, "STABLE", "위험 이벤트가 감지되었습니다"),
        }}
      />,
    );

    expect(screen.getByText("201호")).toBeTruthy();
    expect(screen.getByText("안정")).toBeTruthy();
    expect(screen.queryByText("위험 이벤트가 감지되었습니다")).toBeNull();
  });

  it("keeps CJK room names multiline and status word at staff sizing", () => {
    const stableSpace = space("cjk-room", "긴 이름 생활실 5060호");

    const { container } = render(
      <RoomStatusTreemap
        spaces={[stableSpace]}
        floors={floors}
        statuses={{
          [stableSpace.id]: status(stableSpace.id, "STABLE", "정상"),
        }}
      />,
    );

    const roomNameClass = screen.getByText("긴 이름 생활실 5060호").className;
    expect(roomNameClass).toContain("break-keep");
    expect(roomNameClass).toContain("line-clamp-2");
    expect(roomNameClass).not.toContain("truncate");

    const statusWord = container.querySelector('button[aria-label="긴 이름 생활실 5060호 안정"] span.text-staff-status');
    expect(statusWord?.className).toContain("text-staff-status");
    expect(statusWord?.className).not.toContain("truncate");
  });

  it("still renders aiSummary for a real DANGER tile", () => {
    const dangerSpace = space("danger-room", "202호");

    render(
      <RoomStatusTreemap
        spaces={[dangerSpace]}
        floors={floors}
        statuses={{
          [dangerSpace.id]: status(dangerSpace.id, "DANGER", "낙상 위험 감지"),
        }}
      />,
    );

    expect(screen.getByText("낙상 위험 감지")).toBeTruthy();
  });
  it("renders aiSummary for CHECK_NEEDED and CAUTION tiles", () => {
    const checkNeededSpace = space("check-needed-room", "203호");
    const cautionSpace = space("caution-room", "204호");

    render(
      <RoomStatusTreemap
        spaces={[checkNeededSpace, cautionSpace]}
        floors={floors}
        statuses={{
          [checkNeededSpace.id]: status(checkNeededSpace.id, "CHECK_NEEDED", "확인이 필요한 움직임"),
          [cautionSpace.id]: status(cautionSpace.id, "CAUTION", "주의 관찰 필요"),
        }}
      />,
    );

    expect(screen.getByText("확인이 필요한 움직임")).toBeTruthy();
    expect(screen.getByText("주의 관찰 필요")).toBeTruthy();
  });
});
describe("RoomStatusTreemap layout grid behavior", () => {
  const dangerSpace = space("danger-room", "202호");
  const stableSpaceA = space("stable-room-a", "201호");
  const stableSpaceB = space("stable-room-b", "203호");
  const spaces = [stableSpaceA, stableSpaceB, dangerSpace];
  const statuses: Record<string, SpaceStatus> = {
    [dangerSpace.id]: status(dangerSpace.id, "DANGER", "낙상 위험 감지"),
    [stableSpaceA.id]: status(stableSpaceA.id, "STABLE", "정상"),
    [stableSpaceB.id]: status(stableSpaceB.id, "STABLE", "정상"),
  };

  function tileOrder(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("button[aria-label]")).map((tile) => tile.getAttribute("aria-label") ?? "");
  }

  it("keeps overview tiles uniform while preserving the danger accent and risk-first order", () => {
    const { container } = render(<RoomStatusTreemap spaces={spaces} floors={floors} statuses={statuses} layout="overview" />);

    const allClassNames = Array.from(container.querySelectorAll("*")).map((element) => String(element.className));
    expect(allClassNames.some((className) => className.includes("col-span-2"))).toBe(false);

    const dangerTile = container.querySelector('button[aria-label="202호 위험"]');
    expect(dangerTile?.className).toContain("border-l-8");
    expect(tileOrder(container)).toEqual(["202호 위험", "201호 안정", "203호 안정"]);
  });

  it("uses a responsive focus hero with recent detection time while preserving risk-first order", () => {
    const { container } = render(<RoomStatusTreemap spaces={spaces} floors={floors} statuses={statuses} layout="focus" />);

    const dangerTile = container.querySelector('button[aria-label="202호 위험"]');
    expect(dangerTile?.className).toContain("md:col-span-2");
    expect(screen.getByText(/최근 감지/)).toBeTruthy();
    expect(tileOrder(container)).toEqual(["202호 위험", "201호 안정", "203호 안정"]);
  });
});
