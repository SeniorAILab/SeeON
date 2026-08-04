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

// 프로덕션 실측 구조다. 카메라 7대는 한 층이 아니라 2F/3F/4F에 흩어져 있다
// (cam_sp_202/203/205/2f_prog, cam_sp_301/305, cam_sp_401).
// 한 층으로 뭉쳐 찍으면 승인한 화면과 현장 화면의 층 구성이 달라진다.
const floors: Floor[] = [
  { id: "fl_2f", facilityId: FACILITY, name: "2층", orderIndex: 2, isActive: true },
  { id: "fl_3f", facilityId: FACILITY, name: "3층", orderIndex: 3, isActive: true },
  { id: "fl_4f", facilityId: FACILITY, name: "4층", orderIndex: 4, isActive: true },
];

function space(id: string, name: string, floorId = "fl_2f"): Space {
  return {
    id,
    facilityId: FACILITY,
    floorId,
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
  space("sp_b", "202호"),
  space("sp_c", "203호"),
  space("sp_d", "205호"),
  space("sp_g", "프로그램실"),
  space("sp_e", "301호", "fl_3f"),
  space("sp_f", "305호", "fl_3f"),
  space("sp_a", "401호", "fl_4f"),
];

const MODE = new URLSearchParams(location.search).get("mode") ?? "mixed";

const statuses: Record<string, SpaceStatus> =
  MODE === "all-live"
    ? {
        // 전 카메라 연결 정상. 그 안에서 위험/주의/안정이 섞인 실제 운영
        // 화면을 보여준다 — 연결이 살아 있을 때 위험도가 제대로 드러나는지.
        sp_a: status("sp_a", "DANGER", "LIVE"),
        sp_b: status("sp_b", "CAUTION", "LIVE"),
        sp_c: status("sp_c", "STABLE", "LIVE"),
        sp_d: status("sp_d", "CHECK_NEEDED", "LIVE"),
        sp_e: status("sp_e", "STABLE", "LIVE"),
        sp_f: status("sp_f", "STABLE", "LIVE"),
        sp_g: status("sp_g", "STABLE", "LIVE"),
      }
    : {
        // 살아 있는 2대. 그 중 한 방에서 낙상이 감지된 상태를 함께 보여준다
        // — 연결이 끊긴 방들 사이에서 실제 위험이 묻히지 않는지 확인하는 장면.
        sp_d: status("sp_d", "DANGER", "LIVE"),
        // 이미 다른 요양보호사가 확인한 방. 배지가 붙어야 중복 출동을 막는다.
        sp_g: { ...status("sp_g", "DANGER", "LIVE"), alertStatus: "ACKNOWLEDGED" as const },
        // 끊긴 5대
        sp_a: status("sp_a", "STABLE", "STALE"),
        sp_b: status("sp_b", "STABLE", "STALE"),
        sp_c: status("sp_c", "STABLE", "STALE"),
        sp_e: status("sp_e", "STABLE", "STALE"),
        sp_f: status("sp_f", "STABLE", "STALE"),
      };

// 실제 TV(1920x1080)를 채운다. 고정 크기로 잘라 두면 승인한 화면과
// 현장에서 보이는 화면의 여백·타일 크기가 달라진다.
createRoot(document.getElementById("root")!).render(
  <div data-testid="visual-root" className="flex h-screen w-screen flex-col bg-bg p-4">
    {/* FloorMonitorPage:190과 같은 컨테이너다 — 보드가 남은 높이를 채운다.
        하니스가 고정 높이를 쓰면 승인한 화면과 TV에 뜨는 화면이 달라진다. */}
    <div className="mt-4 flex min-h-0 flex-1">
      <RoomStatusBoard
        // panel 모드: 요양보호사가 위험한 방을 눌렀을 때 뜨는 조작면.
        // I4로 확인(ACK)과 해결 완료(RESOLVE)를 나눈 결과를 눈으로 승인한다.
        selectedSpace={MODE === "panel" ? spaces.find((sp) => sp.id === "sp_d") ?? null : null}
        alertsBySpace={
          MODE === "panel"
            ? {
                sp_d: [
                  {
                    id: "evt-1",
                    facilityId: FACILITY,
                    spaceId: "sp_d",
                    eventType: "FALL_RISK",
                    riskLevel: "DANGER",
                    message: "낙상이 감지되었습니다.",
                    aiSummary: "낙상이 감지되었습니다.",
                    detectedAt: new Date().toISOString(),
                    alertStatus: "PENDING",
                    actions: [],
                    confidence: 0.92,
                    emergency: true,
                  },
                ],
              }
            : {}
        }
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
