import { AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import type { Space, SpaceStatus, SpaceStatusLevel } from "@/types";

export interface RoomStatusTile {
  space: Space;
  status?: SpaceStatus;
  rect: TreemapRect;
}

export interface TreemapRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const STATUS_WEIGHT: Record<SpaceStatusLevel, number> = {
  DANGER: 4,
  CHECK_NEEDED: 3.5,
  CAUTION: 3,
  STABLE: 1,
};

const STATUS_WORD: Record<SpaceStatusLevel, string> = {
  DANGER: "위험",
  CHECK_NEEDED: "확인 필요",
  CAUTION: "주의",
  STABLE: "안정",
};

function statusOf(status?: SpaceStatus): SpaceStatusLevel {
  return status?.status ?? "STABLE";
}

function stableRoomOrder(a: Space, b: Space): number {
  const floor = a.floorId.localeCompare(b.floorId, "ko");
  if (floor !== 0) return floor;
  return a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" });
}

function worstStatus(status?: SpaceStatus): SpaceStatusLevel {
  if (status?.emergency) return "DANGER";
  return statusOf(status);
}

function weightFor(status?: SpaceStatus): number {
  return STATUS_WEIGHT[worstStatus(status)];
}

interface WeightedItem {
  id: string;
  weight: number;
}

export function buildRoomTreemapLayout(
  spaces: Space[],
  statuses: Record<string, SpaceStatus>,
  width: number,
  height: number,
): TreemapRect[] {
  if (width <= 0 || height <= 0 || spaces.length === 0) return [];
  const ordered = [...spaces].sort(stableRoomOrder);
  const weights = ordered.map((space) => weightFor(statuses[space.id]));
  const allEqual = weights.every((weight) => weight === weights[0]);
  const items = ordered.map((space, index) => ({ id: space.id, weight: allEqual ? 1 : weights[index] }));
  return squarify(items, width, height);
}

function squarify(items: WeightedItem[], width: number, height: number): TreemapRect[] {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0) || 1;
  const scale = (width * height) / totalWeight;
  const scaled = items.map((item) => ({ ...item, area: item.weight * scale }));
  const rects: TreemapRect[] = [];
  layoutRows(scaled, { x: 0, y: 0, width, height }, rects);
  return rects;
}

interface AreaItem extends WeightedItem {
  area: number;
}

function layoutRows(items: AreaItem[], box: Omit<TreemapRect, "id">, rects: TreemapRect[]): void {
  const remaining = [...items];
  let current = { ...box };
  while (remaining.length > 0) {
    const row: AreaItem[] = [];
    const side = Math.min(current.width, current.height);
    while (remaining.length > 0) {
      const next = remaining[0];
      if (row.length === 0 || improves(row, next, side)) row.push(remaining.shift()!);
      else break;
    }
    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    if (current.width >= current.height) {
      const rowHeight = rowArea / current.width;
      let x = current.x;
      row.forEach((item, index) => {
        const itemWidth = index === row.length - 1 ? current.x + current.width - x : item.area / rowHeight;
        rects.push({ id: item.id, x, y: current.y, width: itemWidth, height: rowHeight });
        x += itemWidth;
      });
      current = { ...current, y: current.y + rowHeight, height: Math.max(0, current.height - rowHeight) };
    } else {
      const rowWidth = rowArea / current.height;
      let y = current.y;
      row.forEach((item, index) => {
        const itemHeight = index === row.length - 1 ? current.y + current.height - y : item.area / rowWidth;
        rects.push({ id: item.id, x: current.x, y, width: rowWidth, height: itemHeight });
        y += itemHeight;
      });
      current = { ...current, x: current.x + rowWidth, width: Math.max(0, current.width - rowWidth) };
    }
  }
}

function improves(row: AreaItem[], next: AreaItem, side: number): boolean {
  return worst(row, side) >= worst([...row, next], side);
}

function worst(row: AreaItem[], side: number): number {
  const areas = row.map((item) => item.area);
  const sum = areas.reduce((acc, area) => acc + area, 0);
  const min = Math.min(...areas);
  const max = Math.max(...areas);
  const sideSquared = side * side;
  return Math.max((sideSquared * max) / (sum * sum), (sum * sum) / (sideSquared * min));
}

export function RoomStatusTreemap({
  spaces,
  statuses,
  width,
  height,
  selectedSpaceId,
  onSelect,
}: {
  spaces: Space[];
  statuses: Record<string, SpaceStatus>;
  width: number;
  height: number;
  selectedSpaceId?: string | null;
  onSelect?: (space: Space) => void;
}) {
  const rects = buildRoomTreemapLayout(spaces, statuses, width, height);
  const byId = new Map(spaces.map((space) => [space.id, space]));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="list" aria-label="방 상태 트리맵">
      {rects.map((rect) => {
        const space = byId.get(rect.id)!;
        const status = worstStatus(statuses[space.id]);
        const selected = selectedSpaceId === space.id;
        const Icon = iconFor(status);
        const pad = Math.max(8, Math.min(18, rect.width, rect.height) * 0.08);
        return (
          <g key={space.id} role="listitem" aria-label={`${space.name} ${STATUS_WORD[status]}`} onClick={() => onSelect?.(space)} className="cursor-pointer focus:outline-none">
            <rect x={rect.x + 3} y={rect.y + 3} width={Math.max(0, rect.width - 6)} height={Math.max(0, rect.height - 6)} rx="18" className={fillFor(status)} />
            {selected && <rect x={rect.x + 8} y={rect.y + 8} width={Math.max(0, rect.width - 16)} height={Math.max(0, rect.height - 16)} rx="16" fill="none" stroke="currentColor" strokeWidth="4" className="text-brand drop-shadow motion-reduce:drop-shadow-none" />}
            <foreignObject x={rect.x + pad} y={rect.y + pad} width={Math.max(1, rect.width - pad * 2)} height={Math.max(1, rect.height - pad * 2)}>
              <div className={`flex h-full flex-col justify-between overflow-hidden ${textFor(status)}`}>
                <div className="flex items-center gap-2 text-[15px] font-black 2xl:text-xl">
                  <Icon className="h-5 w-5 shrink-0 2xl:h-7 2xl:w-7" aria-hidden />
                  <span className="truncate">{STATUS_WORD[status]}</span>
                </div>
                <div>
                  <div className="truncate text-xl font-black tracking-tight 2xl:text-4xl">{space.name}</div>
                  {statuses[space.id]?.aiSummary && <div className="mt-1 line-clamp-2 text-xs font-bold opacity-90 2xl:text-base">{statuses[space.id]?.aiSummary}</div>}
                </div>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

function fillFor(status: SpaceStatusLevel): string {
  if (status === "DANGER") return "fill-status-dangerBg [filter:drop-shadow(0_14px_28px_rgba(239,68,68,0.24))]";
  if (status === "CHECK_NEEDED") return "fill-status-checkBg [filter:drop-shadow(0_14px_28px_rgba(234,179,8,0.22))]";
  if (status === "CAUTION") return "fill-status-cautionBg [filter:drop-shadow(0_14px_28px_rgba(245,158,11,0.2))]";
  return "fill-surface2";
}

function textFor(status: SpaceStatusLevel): string {
  if (status === "DANGER") return "text-status-danger";
  if (status === "CHECK_NEEDED") return "text-status-check";
  if (status === "CAUTION") return "text-status-caution";
  return "text-ink-soft";
}

function iconFor(status: SpaceStatusLevel) {
  if (status === "DANGER") return AlertTriangle;
  if (status === "CHECK_NEEDED") return HelpCircle;
  if (status === "CAUTION") return ShieldCheck;
  return CheckCircle2;
}
