import { useEffect, useMemo, useRef, useState } from "react";
import { InlineActionPanel } from "@/components/monitor/InlineActionPanel";
import { RoomStatusTreemap } from "./RoomStatusTreemap";
import type { ConnectionState, DetectionEvent, Space, SpaceStatus } from "@/types";

const DEBOUNCE_MS = 2000;

export function connectionChipLabel(connection: ConnectionState, lastUpdateAt: string | null, now = Date.now()): string {
  if (connection === "RECONNECTING") return "재연결 중";
  if (connection === "DELAYED") return "데이터 지연";
  if (connection === "DISCONNECTED") return "연결 끊김";
  const seconds = lastUpdateAt ? Math.max(0, Math.floor((now - new Date(lastUpdateAt).getTime()) / 1000)) : 0;
  return `정상 연결 · ${seconds}초 전 갱신`;
}

export function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setSize({ width: Math.floor(node.clientWidth), height: Math.floor(node.clientHeight) });
    update();
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
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
  alertsBySpace = {},
  connection,
  lastUpdateAt,
  variant = "staff",
  selectedSpace,
  onSelectSpace,
  onClosePanel,
  onResolved,
}: {
  spaces: Space[];
  statuses: Record<string, SpaceStatus>;
  alertsBySpace?: Record<string, DetectionEvent[]>;
  connection: ConnectionState;
  lastUpdateAt: string | null;
  variant?: "staff" | "admin";
  selectedSpace?: Space | null;
  onSelectSpace?: (space: Space) => void;
  onClosePanel?: () => void;
  onResolved?: () => void;
}) {
  const { ref, size } = useMeasuredSize<HTMLDivElement>();
  const visibleStatuses = useDebouncedStatuses(spaces, statuses);
  const activeSpace = selectedSpace && spaces.some((space) => space.id === selectedSpace.id) ? selectedSpace : null;
  const treemapHeight = activeSpace ? Math.max(220, size.height - (variant === "staff" ? 300 : 250)) : size.height;
  const activeAlerts = activeSpace ? (alertsBySpace[activeSpace.id] ?? []) : [];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-surface p-3 shadow-card 2xl:p-4" aria-label="방 상태 보드">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-black text-ink-soft 2xl:text-base">
          <span className="rounded-full bg-status-dangerBg px-3 py-1 text-status-danger">위험</span>
          <span className="rounded-full bg-status-checkBg px-3 py-1 text-status-check">확인 필요</span>
          <span className="rounded-full bg-status-cautionBg px-3 py-1 text-status-caution">주의</span>
          <span className="rounded-full bg-surface2 px-3 py-1 text-ink-soft">안정</span>
        </div>
        <ConnectionChip connection={connection} lastUpdateAt={lastUpdateAt} />
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {size.width > 0 && treemapHeight > 0 && (
          <RoomStatusTreemap spaces={spaces} statuses={visibleStatuses} width={size.width} height={treemapHeight} selectedSpaceId={activeSpace?.id} onSelect={onSelectSpace} />
        )}
      </div>
      {activeSpace && (
        <InlineActionPanel space={activeSpace} status={visibleStatuses[activeSpace.id]} alerts={activeAlerts} onClose={onClosePanel ?? (() => undefined)} onResolved={onResolved} />
      )}
    </section>
  );
}

function ConnectionChip({ connection, lastUpdateAt }: { connection: ConnectionState; lastUpdateAt: string | null }) {
  const label = connectionChipLabel(connection, lastUpdateAt);
  return <span className="rounded-full bg-surface2 px-3 py-1 text-sm font-black tabular-nums text-ink-soft 2xl:text-base">{label}</span>;
}
