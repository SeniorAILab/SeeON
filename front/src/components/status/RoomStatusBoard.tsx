import { useEffect, useMemo, useState } from "react";
import { RoomActionPanel } from "./RoomActionPanel";
import { RoomStatusTreemap } from "./RoomStatusTreemap";
import type { ConnectionState, DetectionEvent, Floor, Space, SpaceStatus } from "@/types";

const DEBOUNCE_MS = 2000;
type RoomStatusLayout = "overview" | "focus";


export function connectionChipLabel(connection: ConnectionState, lastUpdateAt: string | null, now = Date.now()): string {
  if (connection === "RECONNECTING") return "재연결 중";
  if (connection === "DELAYED") return "데이터 지연";
  if (connection === "DISCONNECTED") return "연결 끊김";
  const seconds = lastUpdateAt ? Math.max(0, Math.floor((now - new Date(lastUpdateAt).getTime()) / 1000)) : 0;
  return `정상 연결 · ${seconds}초 전 갱신`;
}


function signature(spaces: Space[], statuses: Record<string, SpaceStatus>): string {
  return spaces
    .map((space) => `${space.id}:${statuses[space.id]?.status ?? "STABLE"}:${statuses[space.id]?.emergency ? 1 : 0}`)
    .sort()
    .join("|");
}

export function useDebouncedStatuses(spaces: Space[], statuses: Record<string, SpaceStatus>, delayMs = DEBOUNCE_MS) {
  const [visible, setVisible] = useState(statuses);
  const sig = useMemo(() => signature(spaces, statuses), [spaces, statuses]);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(statuses), delayMs);
    return () => window.clearTimeout(timer);
  }, [sig, statuses, delayMs]);
  return visible;
}

export function RoomStatusBoard({
  spaces,
  statuses,
  floors,
  alertsBySpace = {},
  connection,
  lastUpdateAt,
  variant: _variant = "staff",
  cardSize = "lg",
  selectedSpace,
  onSelectSpace,
  onClosePanel,
  onResolved,
  layout = "overview",
}: {
  spaces: Space[];
  statuses: Record<string, SpaceStatus>;
  floors: Floor[];
  alertsBySpace?: Record<string, DetectionEvent[]>;
  connection: ConnectionState;
  lastUpdateAt: string | null;
  variant?: "staff" | "admin";
  cardSize?: "lg" | "xl";
  selectedSpace?: Space | null;
  onSelectSpace?: (space: Space) => void;
  onClosePanel?: () => void;
  onResolved?: () => void;
  layout?: RoomStatusLayout;
}) {
  const visibleStatuses = useDebouncedStatuses(spaces, statuses);
  const activeSpace = selectedSpace && spaces.some((space) => space.id === selectedSpace.id) ? selectedSpace : null;
  const activeAlerts = activeSpace ? (alertsBySpace[activeSpace.id] ?? []) : [];

  return (
    <section data-card-size={cardSize} className={`flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-surface p-3 shadow-card 2xl:p-4 ${cardSize === "xl" ? "[&_button[aria-label]]:p-7" : ""}`} aria-label="방 상태 보드">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-base font-black text-ink-soft 2xl:text-lg">
          <span className="rounded-full bg-status-dangerBg px-3 py-1 text-status-danger">위험</span>
          <span className="rounded-full bg-status-checkBg px-3 py-1 text-status-check">확인 필요</span>
          <span className="rounded-full bg-status-cautionBg px-3 py-1 text-status-caution">주의</span>
          <span className="rounded-full bg-surface2 px-3 py-1 text-ink-soft">안정</span>
        </div>
        <ConnectionChip connection={connection} lastUpdateAt={lastUpdateAt} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <RoomStatusTreemap spaces={spaces} statuses={visibleStatuses} floors={floors} selectedSpaceId={activeSpace?.id} onSelect={onSelectSpace} layout={layout} />
      </div>
      {activeSpace && (
        <RoomActionPanel space={activeSpace} status={visibleStatuses[activeSpace.id]} alerts={activeAlerts} onClose={onClosePanel ?? (() => undefined)} onResolved={onResolved} />
      )}
    </section>
  );
}

function ConnectionChip({ connection, lastUpdateAt }: { connection: ConnectionState; lastUpdateAt: string | null }) {
  const label = connectionChipLabel(connection, lastUpdateAt);
  return <span className="rounded-full bg-surface2 px-3 py-1 text-base font-black tabular-nums text-ink-soft 2xl:text-lg">{label}</span>;
}
