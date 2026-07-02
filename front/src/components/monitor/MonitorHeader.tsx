import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DoorOpen, LayoutGrid, RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { RealtimeUpdateIndicator } from "./RealtimeUpdateIndicator";
import { FloorSummaryStats } from "./FloorSummaryStats";
import { SoundToggle } from "./SoundToggle";
import { FullscreenButton } from "./FullscreenButton";
import type { ConnectionState, DashboardSummary } from "@/types";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
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
  floorSelectorPath,
  floorSelectorLabel = "층 선택",
  exitPath,
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
  floorSelectorPath?: string;
  floorSelectorLabel?: string;
  exitPath?: string;
}) {
  const navigate = useNavigate();
  const now = useClock();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

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
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-base font-semibold text-ink-soft hover:bg-surface2"
          >
            <RefreshCw className="h-5 w-5" />
            새로고침
          </button>
          {floorSelectorPath && (
            <button
              onClick={() => navigate(floorSelectorPath)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-base font-semibold text-ink-soft hover:bg-surface2"
            >
              <LayoutGrid className="h-5 w-5" />
              {floorSelectorLabel}
            </button>
          )}
          {exitPath && (
            <button
              onClick={() => navigate(exitPath)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-base font-semibold text-ink-soft hover:bg-surface2"
            >
              <DoorOpen className="h-5 w-5" />
              나가기
            </button>
          )}
          <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
          <FullscreenButton targetRef={fullscreenRef} />
        </div>
      </div>
    </header>
  );
}
