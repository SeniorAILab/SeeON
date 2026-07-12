import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomStatusTreemap, heroTileStyle } from "./RoomStatusTreemap";
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
    alertStatus: level === "STABLE" ? "NONE" : "PENDING",
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

  it("uses a JS-computed hero span with recent detection time while preserving risk-first order", () => {
    const { container } = render(<RoomStatusTreemap spaces={spaces} floors={floors} statuses={statuses} layout="focus" />);

    const dangerTile = container.querySelector('button[aria-label="202호 위험"]') as HTMLElement | null;
    expect(dangerTile?.style.gridColumn).toBe("1 / span 2");
    expect(dangerTile?.style.gridRow).toBe("1 / span 2");
    expect(screen.getByText(/최근 감지/)).toBeTruthy();
    expect(tileOrder(container)).toEqual(["202호 위험", "201호 안정", "203호 안정"]);
  });

  it("anchors the sole hero tile to the grid origin so dense packing can never place it after a non-hero", () => {
    const { container } = render(<RoomStatusTreemap spaces={spaces} floors={floors} statuses={statuses} layout="focus" />);

    // jsdom doesn't expand the grid-column/-row shorthand into start/end longhands, so assert the shorthand itself.
    const dangerTile = container.querySelector('button[aria-label="202호 위험"]') as HTMLElement | null;
    expect(dangerTile?.style.gridColumn).toMatch(/^1 \/ span \d+$/);
    expect(dangerTile?.style.gridRow).toMatch(/^1 \/ span \d+$/);
  });

  it("never applies a fixed min-height to focus tiles (structural no-overlap guarantee)", () => {
    const { container } = render(<RoomStatusTreemap spaces={spaces} floors={floors} statuses={statuses} layout="focus" />);

    const allClassNames = Array.from(container.querySelectorAll("button")).map((el) => el.className);
    expect(allClassNames.every((className) => !className.includes("min-h-[150px]") && !className.includes("min-h-[320px]"))).toBe(true);
    expect(allClassNames.every((className) => className.includes("min-h-0") && className.includes("min-w-0"))).toBe(true);
  });

  it("keeps existing pulse/color emphasis on an enlarged hero tile", () => {
    const { container } = render(<RoomStatusTreemap spaces={spaces} floors={floors} statuses={statuses} layout="focus" />);

    const dangerTile = container.querySelector('button[aria-label="202호 위험"]');
    expect(dangerTile?.className).toContain("animate-pulse-danger");
    expect(dangerTile?.className).toContain("bg-status-dangerBg");
    expect(dangerTile?.className).toContain("text-status-danger");
    expect(container.querySelector('button[aria-label="202호 위험"] .animate-ping')).toBeTruthy();
  });

  it("gives STABLE tiles the safe green pulse while keeping danger/caution emphasis untouched", () => {
    const cautionSpace = space("caution-room", "204호");
    const { container } = render(
      <RoomStatusTreemap
        spaces={[...spaces, cautionSpace]}
        floors={floors}
        statuses={{ ...statuses, [cautionSpace.id]: status(cautionSpace.id, "CAUTION", "주의") }}
        layout="overview"
      />,
    );

    const stableTile = container.querySelector('button[aria-label="201호 안정"]');
    expect(stableTile?.className).toContain("animate-pulse-safe");
    expect(stableTile?.className).not.toContain("animate-pulse-danger");
    expect(container.querySelector('button[aria-label="201호 안정"] span[class*="animate-[ping"]')).toBeTruthy();

    const dangerTile = container.querySelector('button[aria-label="202호 위험"]');
    expect(dangerTile?.className).toContain("animate-pulse-danger");
    expect(dangerTile?.className).not.toContain("animate-pulse-safe");

    const cautionTile = container.querySelector('button[aria-label="204호 주의"]');
    expect(cautionTile?.className).not.toContain("animate-pulse-safe");
    expect(cautionTile?.className).not.toContain("animate-pulse-danger");
    expect(container.querySelector('button[aria-label="204호 주의"] span[class*="animate-"]')).toBeNull();
  });
});

describe("heroTileStyle", () => {
  it("pins the first hero to the origin while keeping its span", () => {
    expect(heroTileStyle(true, 2)).toEqual({ gridColumn: "1 / span 2", gridRow: "1 / span 2" });
  });

  it("pins the first hero to the origin even at span 1", () => {
    expect(heroTileStyle(true, 1)).toEqual({ gridColumn: "1 / span 1", gridRow: "1 / span 1" });
  });

  it("leaves non-first tiles unpinned, spanning in place", () => {
    expect(heroTileStyle(false, 2)).toEqual({ gridColumn: "span 2", gridRow: "span 2" });
  });
});
