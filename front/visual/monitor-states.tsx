/**
 * 현황판 상태 시각 검증 하니스.
 *
 * 아침 승인용 스크린샷(연결끊김 / 정상)을 프로덕션 접근 없이 로컬에서
 * 만든다. 프로덕션 스키마와 같은 모양의 고정 데이터를 쓰되, 실제 방/카메라
 * 이름은 넣지 않는다(사생활 경계).
 *
 * 개발 전용. 프로덕션 번들에 포함되지 않는다.
 */
import { useRef } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { RoomStatusBoard } from "@/components/status/RoomStatusBoard";
import { MonitorHeader } from "@/features/monitor/components/MonitorHeader";
import type { DetectionEvent, Floor, Space, SpaceStatus } from "@/types";
import "@/index.css";

// 조작면은 메모 목록을 서버에서 불러온다. 하니스에는 백엔드가 없으므로
// 그대로 두면 승인 화면에 **"메모를 불러오지 못했습니다" 빨간 오류가 뜬다.**
// 방/상태/알림을 이미 고정값으로 주고 있으므로 메모도 같은 방식으로 준다.
// 오류 배너가 박힌 그림을 승인시키면 정상 화면을 승인한 것이 아니게 된다.
//
// 빈 배열을 주는 이유: 갓 발생한 알림에는 메모가 없다. 그 상태의 문구
// ("저장된 메모가 없습니다")가 내일 현장에서 실제로 보일 문구다.
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/alerts\/[^/]+$/.test(url) && (init?.method ?? "GET").toUpperCase() === "GET") {
    return Promise.resolve(
      new Response(JSON.stringify({ notes: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return realFetch(input as RequestInfo, init);
}) as typeof window.fetch;

const FACILITY = "fac_demo";
// 시설명도 데모 값이다. 실제 이름은 어느 요양원인지 특정한다.
const FACILITY_NAME = "데모 요양원";

// 카메라 7대가 한 층이 아니라 세 층에 흩어진 구성. 층당 4/2/1개다.
// 한 층으로 뭉쳐 찍으면 승인한 화면과 현장 화면의 층 구성이 달라지므로
// 실제 배치와 같은 분포를 쓴다. 방 이름은 데모 값이다 —
// 이 저장소는 공개이고 실제 호실 번호는 입주자 위치 정보다.
const floors: Floor[] = [
  { id: "fl_2f", facilityId: FACILITY, name: "2층", orderIndex: 2, provisioningSource: "PRODUCT" },
  { id: "fl_3f", facilityId: FACILITY, name: "3층", orderIndex: 3, provisioningSource: "PRODUCT" },
  { id: "fl_4f", facilityId: FACILITY, name: "4층", orderIndex: 4, provisioningSource: "PRODUCT" },
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
    provisioningSource: "PRODUCT",
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
  space("sp_b", "A-1"),
  space("sp_c", "A-2"),
  space("sp_d", "A-3"),
  space("sp_g", "공용실"),
  space("sp_e", "B-1", "fl_3f"),
  space("sp_f", "B-2", "fl_3f"),
  space("sp_a", "C-1", "fl_4f"),
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
//
// 헤더까지 함께 그린다. 처음에는 보드만 그렸는데, 그러면 승인 화면에
// **알림 벨 배지가 아예 없다.** 벨 배지는 "상단 가로 배너를 만들지 말고
// 벨 숫자 배지로만 알린다"는 요구의 산출물이라, 그게 빠진 스크린샷을
// 승인받으면 정작 요구한 물건을 승인하지 못한 것이 된다.
// FloorMonitorPage:172가 헤더를 보드 위에 두는 것과 같은 구성이다.
function Harness() {
  const rootRef = useRef<HTMLDivElement>(null);
  const disconnected = spaces
    .filter((sp) => statuses[sp.id]?.connection === "STALE")
    .map((sp) => ({ spaceId: sp.id, name: sp.name, lastSeenAt: null }));
  const danger = Object.values(statuses).filter((st) => st.status === "DANGER").length;
  const stable = Object.values(statuses).filter((st) => st.status === "STABLE").length;

  return (
    <div
      ref={rootRef}
      data-testid="visual-root"
      className="flex h-screen w-screen flex-col bg-bg p-4"
    >
      <MonitorHeader
        facilityName={FACILITY_NAME}
        floorTitle="전체"
        summary={{
          totalSpaces: spaces.length,
          stable,
          caution: 0,
          danger,
          checkNeeded: danger,
          unacknowledged: MODE === "all-live" ? 1 : 2,
        }}
        totalPeople={spaces.length}
        connection="NORMAL"
        lastUpdateAt={new Date().toISOString()}
        soundEnabled
        onToggleSound={() => {}}
        onRefresh={() => {}}
        fullscreenRef={rootRef as React.RefObject<HTMLElement>}
        floors={floors}
        currentFloorId={null}
        facilityId={FACILITY}
        // 연결 끊긴 방이 벨 배지의 숫자가 된다. 지어낸 숫자를 쓰지 않는다.
        disconnectedRooms={disconnected}
      />
      {/* FloorMonitorPage:190과 같은 컨테이너다 — 보드가 남은 높이를 채운다.
          하니스가 고정 높이를 쓰면 승인한 화면과 TV에 뜨는 화면이 달라진다. */}
      <div className="mt-4 flex min-h-0 flex-1">
      <RoomStatusBoard
        // panel 모드: 요양보호사가 위험한 방을 눌렀을 때 뜨는 조작면.
        // I4로 확인(ACK)과 해결 완료(RESOLVE)를 나눈 결과를 눈으로 승인한다.
        selectedSpace={MODE === "panel" ? spaces.find((sp) => sp.id === "sp_d") ?? null : null}
        alertsBySpace={
          (MODE === "panel"
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
            : {}) as Record<string, DetectionEvent[]>
        }
        spaces={spaces}
        statuses={statuses}
        floors={floors}
        connection="NORMAL"
        lastUpdateAt={new Date().toISOString()}
        variant="staff"
        layout="overview"
        // 프로덕션 기본값과 같은 값을 쓴다(monitorSettingsStore.ts:14 = "lg").
        // 여기서 "xl"을 쓰면 승인한 화면이 실제 TV보다 크게 그려져,
        // 넘침 여부를 승인 시점에 판별할 수 없다.
        cardSize="lg"
      />
      </div>
    </div>
  );
}

// MonitorHeader가 라우터 훅(useNavigate)을 쓰므로 Router로 감싼다.
// 감싸지 않으면 하니스가 흰 화면으로 뜨고, 그걸 승인 산출물로 착각하기 쉽다.
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <Harness />
  </MemoryRouter>,
);
