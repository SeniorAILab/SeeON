import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomStatusTreemap, heroTileStyle } from "./RoomStatusTreemap";
import type { DetectionEvent, Floor, Space, SpaceStatus } from "@/types";

const { recordDashboardPresentationMock } = vi.hoisted(() => ({
  recordDashboardPresentationMock: vi.fn(),
}));

vi.mock("@/services/dashboardReceiptService", () => ({
  recordDashboardPresentation: recordDashboardPresentationMock,
}));

const floors: Floor[] = [{ id: "2", facilityId: "fac", name: "2F", orderIndex: 2, provisioningSource: "PRODUCT" }];

function space(id: string, name: string): Space {
  return { id, facilityId: "fac", floorId: "2", name, type: "ROOM", capacity: 1, isActive: true, provisioningSource: "PRODUCT" };
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
    connection: "LIVE",
    lastSeenAt: "2026-08-03T11:59:30.000Z",
    alertStatus: level === "STABLE" ? "NONE" : "PENDING",
  };
}

function presentationAlert(spaceId: string): DetectionEvent {
  return {
    id: `alert-${spaceId}`,
    backendEventId: `event-${spaceId}`,
    facilityId: "fac",
    spaceId,
    alertSeq: "42",
    eventType: "BED_EXIT",
    riskLevel: "HIGH",
    message: "침상 이탈 감지",
    aiSummary: "침상 이탈이 감지되었습니다.",
    detectedAt: "2026-07-17T03:00:00.000Z",
    alertStatus: "PENDING",
    actions: [],
  };
}

beforeEach(() => {
  recordDashboardPresentationMock.mockReset();
  recordDashboardPresentationMock.mockResolvedValue(null);
});

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

describe("RoomStatusTreemap presentation receipts", () => {
  it("records once after a correlated danger tile is committed to the DOM", () => {
    const dangerSpace = space("receipt-room", "205호");
    const event = presentationAlert(dangerSpace.id);
    const props = {
      spaces: [dangerSpace],
      floors,
      statuses: {
        [dangerSpace.id]: status(dangerSpace.id, "DANGER", "침상 이탈 감지"),
      },
      presentationAlertsBySpace: { [dangerSpace.id]: event },
      receiptSurface: "admin-room-board" as const,
    };

    const { container, rerender } = render(<RoomStatusTreemap {...props} />);

    expect(container.querySelector('[data-backend-event-id="event-receipt-room"]')?.isConnected).toBe(true);
    expect(recordDashboardPresentationMock).toHaveBeenCalledTimes(1);
    expect(recordDashboardPresentationMock).toHaveBeenCalledWith(
      { id: event.id, alertSeq: event.alertSeq, backendEventId: event.backendEventId },
      "admin-room-board:overview",
    );

    rerender(<RoomStatusTreemap {...props} />);
    expect(recordDashboardPresentationMock).toHaveBeenCalledTimes(1);
  });

  it("does not claim presentation while the tile still renders stable", () => {
    const stableSpace = space("delayed-room", "206호");

    render(
      <RoomStatusTreemap
        spaces={[stableSpace]}
        floors={floors}
        statuses={{
          [stableSpace.id]: status(stableSpace.id, "STABLE", ""),
        }}
        presentationAlertsBySpace={{
          [stableSpace.id]: presentationAlert(stableSpace.id),
        }}
      />,
    );

    expect(recordDashboardPresentationMock).not.toHaveBeenCalled();
  });
});

describe("RoomStatusTreemap — 연결 끊김 표시(직교)", () => {
  function renderTile(level: SpaceStatus["status"], connection: "LIVE" | "STALE") {
    const room = space("sp_205", "205호");
    const base = status(room.id, level, "");
    return render(
      <RoomStatusTreemap
        spaces={[room]}
        floors={floors}
        statuses={{
          [room.id]: {
            ...base,
            connection,
            lastSeenAt: connection === "STALE" ? "2026-08-01T06:47:44.174Z" : base.lastSeenAt,
          },
        }}
      />,
    );
  }

  it("STALE인 방은 연결 끊김으로 표기되고 data 속성이 노출된다", () => {
    renderTile("STABLE", "STALE");

    const tile = screen.getByRole("button", { name: "205호 연결 끊김" });
    expect(tile.getAttribute("data-connection")).toBe("STALE");
    expect(tile.getAttribute("data-space-id")).toBe("sp_205");
    // 위험도는 연결 상태에 덮이지 않는다.
    expect(tile.getAttribute("data-status")).toBe("STABLE");
  });

  it("LIVE인 방은 기존 상태 문구를 그대로 쓴다", () => {
    renderTile("STABLE", "LIVE");

    const tile = screen.getByRole("button", { name: /205호/ });
    expect(tile.getAttribute("data-connection")).toBe("LIVE");
    expect(tile.getAttribute("aria-label")).not.toContain("연결 끊김");
  });

  it("DANGER인 방이 끊겨도 위험도가 사라지지 않는다", () => {
    renderTile("DANGER", "STALE");

    const tile = screen.getByRole("button", { name: "205호 연결 끊김" });
    expect(tile.getAttribute("data-status")).toBe("DANGER");
  });

  it("끊긴 타일에 체크 아이콘을 남기지 않는다", () => {
    // 체크 표시는 "이상 없음"으로 읽힌다. '연결 끊김'이라는 글자와 정반대
    // 신호를 주면 지나가며 보는 사람에게는 체크만 눈에 들어온다.
    renderTile("STABLE", "STALE");
    const tile = screen.getByRole("button", { name: "205호 연결 끊김" });
    const cls = tile.querySelector("svg")?.getAttribute("class") ?? "";
    expect(cls).toContain("lucide-video-off");
    expect(cls).not.toContain("lucide-circle-check");
  });

  it("연결된 타일은 기존 상태 아이콘을 유지한다", () => {
    renderTile("STABLE", "LIVE");
    const tile = screen.getByRole("button", { name: /205호/ });
    const cls = tile.querySelector("svg")?.getAttribute("class") ?? "";
    expect(cls).toContain("lucide-circle-check");
    expect(cls).not.toContain("lucide-video-off");
  });

  it("이미 확인한 알림은 확인됨 배지를 단다", () => {
    // 표시하지 않으면 두 번째 요양보호사가 같은 방으로 또 달려간다.
    const room = space("sp_205", "205호");
    const base = status(room.id, "DANGER", "낙상 감지");
    render(
      <RoomStatusTreemap
        spaces={[room]}
        floors={floors}
        statuses={{ [room.id]: { ...base, alertStatus: "ACKNOWLEDGED" } }}
      />,
    );

    expect(screen.getByTestId("acknowledged-badge").textContent).toBe("확인됨");
  });

  it("아직 확인 전이면 배지를 달지 않는다", () => {
    const room = space("sp_205", "205호");
    const base = status(room.id, "DANGER", "낙상 감지");
    render(
      <RoomStatusTreemap
        spaces={[room]}
        floors={floors}
        statuses={{ [room.id]: { ...base, alertStatus: "PENDING" } }}
      />,
    );

    expect(screen.queryByTestId("acknowledged-badge")).toBeNull();
  });

  // 계획의 H1/H2 수용 기준은 이 파일의 `readability` 이름으로 실행된다
  // (`vitest run ... -t readability`). 타이포 하한 자체는
  // src/lib/staffTypography.test.ts가 tailwind 설정을 직접 검증하고,
  // 여기서는 타일이 그 스케일을 실제로 쓰는지 본다.
  describe("readability — 4m 거리에서 읽히는 크기를 쓴다", () => {
    // 계획의 H1/H2 수용 기준이 이 이름으로 실행된다
    // (`vitest run ... -t readability`). 타이포 하한 자체는
    // src/lib/staffTypography.test.ts가 tailwind 설정을 검증하고,
    // 여기서는 타일이 그 스케일을 실제로 쓰는지 본다.
    function renderRichTile() {
      const room = space("sp_205", "205호");
      const base = status(room.id, "DANGER", "낙상이 감지되었습니다.");
      return render(
        <RoomStatusTreemap
          spaces={[room]}
          floors={floors}
          statuses={{
            [room.id]: {
              ...base,
              connection: "LIVE",
              lastDetectedAt: new Date().toISOString(),
            },
          }}
          layout="focus"
        />,
      );
    }

    it("상태 문구가 대형 상태 스케일을 쓴다", () => {
      renderRichTile();
      const tile = screen.getByRole("button", { name: /205호/ });
      const statusLine = tile.querySelector(".text-staff-status");
      expect(statusLine).not.toBeNull();
      expect(statusLine?.textContent).toContain("위험");
    });

    it("설명 문구가 본문 스케일을 쓴다", () => {
      renderRichTile();
      const tile = screen.getByRole("button", { name: /205호/ });
      const summary = tile.querySelector(".text-staff-body");
      expect(summary).not.toBeNull();
      expect(summary?.textContent).toContain("낙상");
    });

    it("타일 어디에도 14px 이하 클래스가 남지 않는다", () => {
      // 예전에는 '최근 감지'가 text-sm(14px)로 남아 4m에서 안 보였다.
      renderRichTile();
      const tile = screen.getByRole("button", { name: /205호/ });
      expect(tile.querySelector(".text-sm")).toBeNull();
      expect(tile.querySelector(".text-xs")).toBeNull();
    });
  });

  // 계획 §6 CRIT-P3-017: LIVE=2/STALE=5 카운트는 "2녹색5회색"과 동치가 아니다.
  // LIVE인데 DANGER면 그 타일은 빨강이다. 오라클이 그걸 녹색으로 세지
  // 않는지 고정한다.
  describe("green-gray-semantics — 카운트가 색을 보장하지 않는다", () => {
    it("LIVE + DANGER는 STABLE이 아니므로 녹색 집합에 들지 않는다", () => {
      renderTile("DANGER", "LIVE");
      const tile = screen.getByRole("button", { name: /205호/ });

      expect(tile.getAttribute("data-connection")).toBe("LIVE");
      // 오라클 (5)의 판정식과 같은 조건.
      expect(tile.getAttribute("data-status")).not.toBe("STABLE");
    });

    it("LIVE + STABLE만 녹색 집합에 든다", () => {
      renderTile("STABLE", "LIVE");
      const tile = screen.getByRole("button", { name: /205호/ });

      expect(tile.getAttribute("data-connection")).toBe("LIVE");
      expect(tile.getAttribute("data-status")).toBe("STABLE");
    });

    it("STALE은 underlying status와 무관하게 연결 끊김 라벨을 단다", () => {
      // 오라클 (6)의 판정식과 같은 조건.
      for (const level of ["STABLE", "DANGER", "CAUTION", "CHECK_NEEDED"] as const) {
        const { unmount } = renderTile(level, "STALE");
        const tile = screen.getByRole("button", { name: /205호/ });
        expect(tile.getAttribute("aria-label")).toContain("연결 끊김");
        expect(tile.getAttribute("data-connection")).toBe("STALE");
        unmount();
      }
    });
  });

  // 47행 DELETE 후 프로덕션에는 1층과 5층에 방이 하나도 안 남는다.
  // 빈 층 그룹이 화면에 뜨면 원장이 "방이 사라졌다"로 읽는다.
  describe("방이 없는 층은 화면에 나타나지 않는다", () => {
    it("빈 층은 그룹째 빠진다", () => {
      const room = { ...space("sp_205", "205호"), floorId: "fl_2f" };
      const emptyFloors = [
        { id: "fl_1f", facilityId: "fac", name: "1층", orderIndex: 1, isActive: true, provisioningSource: "PRODUCT" as const },
        { id: "fl_2f", facilityId: "fac", name: "2층", orderIndex: 2, isActive: true, provisioningSource: "PRODUCT" as const },
        { id: "fl_5f", facilityId: "fac", name: "5층", orderIndex: 5, isActive: true, provisioningSource: "PRODUCT" as const },
      ];

      render(
        <RoomStatusTreemap
          spaces={[room]}
          floors={emptyFloors}
          statuses={{ [room.id]: status(room.id, "STABLE", "") }}
        />,
      );

      expect(screen.getByText("2층")).toBeTruthy();
      expect(screen.queryByText("1층")).toBeNull();
      expect(screen.queryByText("5층")).toBeNull();
    });
  });
});
