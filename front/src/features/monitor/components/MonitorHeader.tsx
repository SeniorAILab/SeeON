import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, DoorOpen, RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { RealtimeUpdateIndicator } from "./RealtimeUpdateIndicator";
import { FloorSummaryStats } from "./FloorSummaryStats";
import { SoundToggle } from "./SoundToggle";
import { FullscreenButton } from "./FullscreenButton";
import { dashboardPath, floorPath } from "@/lib/routeAccess";
import type { ConnectionState, DashboardSummary, Floor } from "@/types";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatLastSeen(iso: string): string {
  const seen = new Date(iso);
  if (Number.isNaN(seen.getTime())) return "시각 불명";
  const mm = String(seen.getMonth() + 1).padStart(2, "0");
  const dd = String(seen.getDate()).padStart(2, "0");
  const hh = String(seen.getHours()).padStart(2, "0");
  const mi = String(seen.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function MonitorHeader({
  facilityName,
  floorTitle,
  summary,
  totalPeople,
  connection,
  lastUpdateAt,
  soundEnabled,
  onToggleSound,
  onRefresh,
  fullscreenRef,
  floors,
  currentFloorId,
  facilityId,
  showAllView = true,
  exitPath,
  disconnectedRooms = [],
}: {
  facilityName: string;
  floorTitle: string;
  summary: DashboardSummary;
  totalPeople: number;
  connection: ConnectionState;
  lastUpdateAt: string | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRefresh: () => void;
  fullscreenRef: React.RefObject<HTMLElement>;
  floors: Floor[];
  currentFloorId?: string | null;
  facilityId: string;
  showAllView?: boolean;
  exitPath?: string;
  /** 연결이 끊긴 방 목록. 벨 배지와 드롭다운 내용을 만든다. */
  disconnectedRooms?: { spaceId: string; name: string; lastSeenAt: string | null }[];
}) {
  const navigate = useNavigate();
  // 상단 가로 배너는 만들지 않는다. 화면은 조용히 두고, 정보는 벨 배지로
  // 남긴다(누르지 않아도 숫자는 보인다).
  const [bellOpen, setBellOpen] = useState(false);
  const now = useClock();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const orderedFloors = [...floors].sort((a, b) => a.orderIndex - b.orderIndex);
  const hasFloorSelector = orderedFloors.length > 0;
  const floorTabClass = (active: boolean) =>
    `inline-flex min-h-12 items-center rounded-full px-4 py-2 text-lg font-bold transition-colors 2xl:text-xl ${
      active
        ? "bg-brand text-white"
        : "border border-border text-ink-soft hover:bg-surface2"
    }`;

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <LogoMark size={40} />
        <div>
          <div className="flex items-center gap-2 text-xl font-semibold text-ink-soft 2xl:text-2xl">
            {facilityName}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight text-ink 2xl:text-4xl">
            {floorTitle} 안전 현황
          </h1>
        </div>

        {/* 시계 */}
        <div className="ml-auto text-right">
          <div className="text-4xl font-black tabular-nums leading-none text-ink 2xl:text-5xl">
            {hh}:{mm}
            <span className="text-2xl text-ink-faint 2xl:text-3xl">:{ss}</span>
          </div>
          <div className="mt-1 flex items-center justify-end gap-3">
            <RealtimeUpdateIndicator lastUpdateAt={lastUpdateAt} />
            <ConnectionStatusBadge state={connection} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <FloorSummaryStats summary={summary} />
          <span className="text-xl text-ink-soft 2xl:text-2xl">
            총 감지 인원 <b className="tabular-nums text-ink">{totalPeople}명</b>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-lg font-semibold text-ink-soft hover:bg-surface2"
          >
            <RefreshCw className="h-5 w-5" />
            새로고침
          </button>
          {exitPath && (
            <button
              onClick={() => navigate(exitPath)}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-lg font-semibold text-ink-soft hover:bg-surface2"
            >
              <DoorOpen className="h-5 w-5" />
              나가기
            </button>
          )}
          <div className="relative flex min-h-12 items-center">
            <button
              type="button"
              onClick={() => setBellOpen((open) => !open)}
              aria-label={
                disconnectedRooms.length > 0
                  ? `카메라 ${disconnectedRooms.length}대 연결 끊김`
                  : "카메라 연결 이상 없음"
              }
              aria-expanded={bellOpen}
              className="relative inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-lg font-semibold text-ink-soft hover:bg-surface2"
            >
              <Bell className="h-5 w-5" />
              {disconnectedRooms.length > 0 && (
                <span className="min-w-6 rounded-full bg-status-danger px-2 py-0.5 text-center text-base font-black text-white">
                  {disconnectedRooms.length}
                </span>
              )}
            </button>
            {bellOpen && (
              <div
                role="dialog"
                aria-label="연결 끊긴 카메라"
                className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-surface p-3 shadow-card"
              >
                {disconnectedRooms.length === 0 ? (
                  <p className="text-base text-ink-soft">연결이 끊긴 카메라가 없습니다.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {disconnectedRooms.map((room) => (
                      <li key={room.spaceId} className="text-base text-ink">
                        <span className="font-bold">{room.name}</span>
                        <span className="ml-2 text-ink-soft">
                          {room.lastSeenAt
                            ? `마지막 확인 ${formatLastSeen(room.lastSeenAt)}`
                            : "확인된 적 없음"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="flex min-h-12 items-center">
            <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
          </div>
          <FullscreenButton targetRef={fullscreenRef} />
        </div>
      </div>
      {hasFloorSelector && (
        <nav aria-label="층 선택" className="flex flex-wrap gap-2">
          {showAllView && (
            <button
              type="button"
              onClick={() => navigate(dashboardPath(facilityId))}
              aria-current={currentFloorId == null ? "page" : undefined}
              className={floorTabClass(currentFloorId == null)}
            >
              전체
            </button>
          )}
          {orderedFloors.map((floor) => {
            const active = currentFloorId === floor.id;
            return (
              <button
                key={floor.id}
                type="button"
                onClick={() => navigate(floorPath(facilityId, floor.id))}
                aria-current={active ? "page" : undefined}
                className={floorTabClass(active)}
              >
                {floor.name}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
