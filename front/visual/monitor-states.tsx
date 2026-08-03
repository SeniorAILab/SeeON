/**
 * 현황판 상태 시각 검증 하니스.
 *
 * 아침 승인용 스크린샷(연결끊김 / 정상)을 프로덕션 접근 없이 로컬에서
 * 만든다. 프로덕션 스키마와 같은 모양의 고정 데이터를 쓰되, 실제 방/카메라
 * 이름은 넣지 않는다(사생활 경계).
 *
 * 개발 전용. 프로덕션 번들에 포함되지 않는다.
 */
import { createRoot } from "react-dom/client";
import { RoomStatusBoard } from "@/components/status/RoomStatusBoard";
import type { Floor, Space, SpaceStatus } from "@/types";
import "@/index.css";

const FACILITY = "fac_demo";

const floors: Floor[] = [
  { id: "fl_2f", facilityId: FACILITY, name: "2층", orderIndex: 2, isActive: true },
];

function space(id: string, name: string): Space {
  return {
    id,
    facilityId: FACILITY,
    floorId: "fl_2f",
    name,
    type: "ROOM",
    capacity: 1,
    isActive: true,
  };
}

function status(
  spaceId: string,
  level: SpaceStatus["status"],
  connection: "LIVE" | "STALE",
): SpaceStatus {
  return {
    id: `status_${spaceId}`,
    spaceId,
    peopleCount: connection === "LIVE" ? 1 : 0,
    movementLevel: level === "STABLE" ? "LOW" : "HIGH",
    fallRiskLevel: level === "STABLE" ? "LOW" : "HIGH",
    status: level,
    connection,
    lastSeenAt:
      connection === "LIVE"
        ? new Date().toISOString()
        : "2026-08-01T06:47:44.174Z",
    aiSummary: level === "STABLE" ? "" : "낙상이 감지되었습니다.",
    lastDetectedAt: "",
    alertStatus: level === "STABLE" ? "NONE" : "PENDING",
  };
}

/**
 * 내일 아침 실제 구성: 카메라 2대만 살아 있고 5대는 끊긴 상태.
 * 오라클이 기대하는 2녹색 / 5회색을 그대로 재현한다.
 */
const spaces: Space[] = [
  space("sp_a", "201호"),
  space("sp_b", "202호"),
  space("sp_c", "203호"),
  space("sp_d", "205호"),
  space("sp_e", "301호"),
  space("sp_f", "305호"),
  space("sp_g", "프로그램실"),
];

const MODE = new URLSearchParams(location.search).get("mode") ?? "mixed";

const statuses: Record<string, SpaceStatus> =
  MODE === "all-live"
    ? Object.fromEntries(spaces.map((s) => [s.id, status(s.id, "STABLE", "LIVE")]))
    : {
        // 살아 있는 2대
        sp_d: status("sp_d", "STABLE", "LIVE"),
        sp_g: status("sp_g", "STABLE", "LIVE"),
        // 끊긴 5대
        sp_a: status("sp_a", "STABLE", "STALE"),
        sp_b: status("sp_b", "STABLE", "STALE"),
        sp_c: status("sp_c", "STABLE", "STALE"),
        sp_e: status("sp_e", "STABLE", "STALE"),
        sp_f: status("sp_f", "STABLE", "STALE"),
      };

createRoot(document.getElementById("root")!).render(
  <div data-testid="visual-root" className="min-h-screen bg-bg p-6">
    <div style={{ height: "80vh" }} className="flex">
      <RoomStatusBoard
        spaces={spaces}
        statuses={statuses}
        floors={floors}
        connection="NORMAL"
        lastUpdateAt={new Date().toISOString()}
        variant="staff"
        layout="overview"
        cardSize="xl"
      />
    </div>
  </div>,
);
