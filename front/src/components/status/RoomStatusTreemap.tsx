import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { computeGridSpec } from "./gridSpec";
import { useFlipAnimation } from "./useFlipAnimation";
import { pulseClassFor, StatusPulseRing, type PulseTone } from "./StatusPulse";
import { recordDashboardPresentation } from "@/services/dashboardReceiptService";
import type { DashboardReceiptSurface, DashboardReceiptSurfaceBase } from "@/services/dashboardReceiptService";
import type { DetectionEvent, Floor, Space, SpaceStatus, SpaceStatusLevel } from "@/types";

export interface RoomFloorGroup {
  floor: Floor | null;
  floorName: string;
  rooms: Space[];
  alertCount: number;
}

const STATUS_WEIGHT: Record<SpaceStatusLevel, number> = {
  DANGER: 4,
  CHECK_NEEDED: 3,
  CAUTION: 2,
  STABLE: 1,
};

const STATUS_WORD: Record<SpaceStatusLevel, string> = {
  DANGER: "위험",
  CHECK_NEEDED: "확인 필요",
  CAUTION: "주의",
  STABLE: "안정",
};
type RoomStatusLayout = "overview" | "focus";


function statusOf(status?: SpaceStatus): SpaceStatusLevel {
  return status?.status ?? "STABLE";
}

function worstStatus(status?: SpaceStatus): SpaceStatusLevel {
  if (status?.emergency) return "DANGER";
  return statusOf(status);
}

function isEmergencyLevel(level: SpaceStatusLevel): boolean {
  return level === "DANGER" || level === "CHECK_NEEDED";
}

function compareRoomsByRisk(statuses: Record<string, SpaceStatus>) {
  return (a: Space, b: Space) => {
    const severity = STATUS_WEIGHT[worstStatus(statuses[b.id])] - STATUS_WEIGHT[worstStatus(statuses[a.id])];
    if (severity !== 0) return severity;
    return a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" });
  };
}

function floorNameFor(floorId: string): string {
  return floorId ? floorId : "미지정";
}

export function groupRoomsByFloor(spaces: Space[], statuses: Record<string, SpaceStatus>, floors: Floor[] = []): RoomFloorGroup[] {
  const floorById = new Map(floors.map((floor) => [floor.id, floor]));
  const knownGroups = new Map<string, Space[]>();
  const unknownGroups = new Map<string, Space[]>();

  for (const space of spaces) {
    const target = floorById.has(space.floorId) ? knownGroups : unknownGroups;
    target.set(space.floorId, [...(target.get(space.floorId) ?? []), space]);
  }

  const toGroup = (floorId: string, rooms: Space[], floor: Floor | null): RoomFloorGroup => {
    const orderedRooms = [...rooms].sort(compareRoomsByRisk(statuses));
    return {
      floor,
      floorName: floor?.name ?? floorNameFor(floorId),
      rooms: orderedRooms,
      alertCount: orderedRooms.filter((space) => {
        const status = worstStatus(statuses[space.id]);
        return status === "DANGER" || status === "CHECK_NEEDED";
      }).length,
    };
  };

  const groups = floors
    .filter((floor) => knownGroups.has(floor.id))
    .map((floor) => toGroup(floor.id, knownGroups.get(floor.id)!, floor));

  const unknown = [...unknownGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" }))
    .map(([floorId, rooms]) => toGroup(floorId, rooms, null));

  return [...groups, ...unknown];
}

export function RoomStatusTreemap({
  spaces,
  statuses,
  floors = [],
  selectedSpaceId,
  onSelect,
  layout = "overview",
  cardSize = "lg",
  presentationAlertsBySpace = {},
  receiptSurface = "monitor-room-board",
}: {
  spaces: Space[];
  statuses: Record<string, SpaceStatus>;
  floors?: Floor[];
  selectedSpaceId?: string | null;
  onSelect?: (space: Space) => void;
  layout?: RoomStatusLayout;
  cardSize?: "lg" | "xl";
  presentationAlertsBySpace?: Record<string, DetectionEvent>;
  receiptSurface?: DashboardReceiptSurfaceBase;
}) {
  const groups = groupRoomsByFloor(spaces, statuses, floors);

  return (
    <div
      className={layout === "focus" ? "flex h-full w-full flex-col gap-4 overflow-hidden" : "flex h-full w-full flex-col gap-4 overflow-auto pr-1"}
      role="list"
      aria-label="방 상태 히트맵"
    >
      {groups.map((group) => (
        <section
          key={group.floor?.id ?? `unknown-${group.floorName}`}
          aria-label={`${group.floorName} 층`}
          className={layout === "focus" ? "flex min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-border bg-bg/45 p-3 2xl:p-4" : "rounded-3xl border border-border bg-bg/45 p-3 2xl:p-4"}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-black text-ink 2xl:text-xl">{group.floorName}</h3>
            <span className={group.alertCount > 0 ? "rounded-full bg-status-dangerBg px-3 py-1 text-lg font-black text-status-danger" : "rounded-full bg-surface2 px-3 py-1 text-lg font-black text-ink-soft"}>
              이벤트 {group.alertCount}건
            </span>
          </div>
          {layout === "focus" ? (
            <FocusRoomGrid rooms={group.rooms} statuses={statuses} selectedSpaceId={selectedSpaceId} onSelect={onSelect} cardSize={cardSize} presentationAlertsBySpace={presentationAlertsBySpace} receiptSurface={receiptSurface} />
          ) : (
            <div className="grid auto-rows-[minmax(160px,auto)] grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3" role="list">
              {group.rooms.map((space) => (
                <RoomTile key={space.id} space={space} status={statuses[space.id]} selected={selectedSpaceId === space.id} onSelect={onSelect} layout="overview" cardSize={cardSize} presentationAlert={presentationAlertsBySpace[space.id]} receiptSurface={receiptSurface} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function heroTileStyle(isFirstHero: boolean, span: 1 | 2): CSSProperties {
  if (isFirstHero) {
    return { gridColumn: `1 / span ${span}`, gridRow: `1 / span ${span}` };
  }
  return { gridColumn: `span ${span}`, gridRow: `span ${span}` };
}

function FocusRoomGrid({
  rooms,
  statuses,
  selectedSpaceId,
  onSelect,
  cardSize,
  presentationAlertsBySpace,
  receiptSurface,
}: {
  rooms: Space[];
  statuses: Record<string, SpaceStatus>;
  selectedSpaceId?: string | null;
  onSelect?: (space: Space) => void;
  cardSize: "lg" | "xl";
  presentationAlertsBySpace: Record<string, DetectionEvent>;
  receiptSurface: DashboardReceiptSurfaceBase;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => update());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const heroIds = useMemo(
    () => new Set(rooms.filter((space) => isEmergencyLevel(worstStatus(statuses[space.id]))).map((space) => space.id)),
    [rooms, statuses],
  );

  const spec = computeGridSpec(rooms.length, heroIds.size, size.width, size.height);

  const flipSignature = [rooms.map((room) => room.id).join(","), spec.cols, spec.rows, spec.heroSpan].join("|");
  useFlipAnimation(containerRef, flipSignature);

  let firstHeroSeen = false;

  return (
    <div
      ref={containerRef}
      role="list"
      className="grid min-h-0 min-w-0 flex-1 gap-4"
      style={{
        gridTemplateColumns: `repeat(${spec.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${spec.rows}, minmax(0, 1fr))`,
        gridAutoFlow: "dense",
      }}
    >
      {rooms.map((space) => {
        const isHero = heroIds.has(space.id);
        const span = isHero ? spec.heroSpan : 1;
        const isFirstHero = isHero && !firstHeroSeen;
        if (isFirstHero) firstHeroSeen = true;
        return (
          <RoomTile
            key={space.id}
            space={space}
            status={statuses[space.id]}
            selected={selectedSpaceId === space.id}
            onSelect={onSelect}
            layout="focus"
            style={heroTileStyle(isFirstHero, span)}
            flipKey={space.id}
            cardSize={cardSize}
            presentationAlert={presentationAlertsBySpace[space.id]}
            receiptSurface={receiptSurface}
          />
        );
      })}
    </div>
  );
}

function RoomTile({
  space,
  status,
  selected,
  onSelect,
  layout,
  style,
  flipKey,
  cardSize,
  presentationAlert,
  receiptSurface,
}: {
  space: Space;
  status?: SpaceStatus;
  selected: boolean;
  onSelect?: (space: Space) => void;
  layout: RoomStatusLayout;
  style?: CSSProperties;
  flipKey?: string;
  cardSize: "lg" | "xl";
  presentationAlert?: DetectionEvent;
  receiptSurface: DashboardReceiptSurfaceBase;
}) {
  const tileRef = useRef<HTMLButtonElement>(null);
  const level = worstStatus(status);
  const Icon = iconFor(level);
  const hero = layout === "focus" && isEmergencyLevel(level);
  const isDanger = level === "DANGER" || status?.emergency;
  const isCheck = level === "CHECK_NEEDED";
  const isSafe = level === "STABLE" && !isDanger;
  // 연결 끊김은 위험도와 직교한다. status를 덮지 않고 오버레이로만 표현하며,
  // 끊긴 방은 펄스를 멈춘다(움직임 없음 = 감지 안 됨). 다만 침묵만으로는
  // "이상 없음"과 구분되지 않으므로 회색 해칭과 라벨을 함께 얹는다.
  const isDisconnected = status?.connection === "STALE";
  const pulseTone: PulseTone | null = isDisconnected
    ? null
    : isDanger || isCheck
      ? "danger"
      : isSafe
        ? "safe"
        : null;
  const recentDetectedAt = hero && status?.lastDetectedAt ? timeAgo(status.lastDetectedAt) : null;
  const surface: DashboardReceiptSurface = `${receiptSurface}:${layout}`;

  // Depend on primitives, not the alert object: presentationAlertsBySpace is
  // rebuilt on every poll cycle, so an object dependency would re-fire this
  // effect for every visible tile on every tick.
  const presentationAlertId = presentationAlert?.id;
  const presentationAlertSeq = presentationAlert?.alertSeq;
  const presentationEventId = presentationAlert?.backendEventId;
  useLayoutEffect(() => {
    const tile = tileRef.current;
    if (
      level === "STABLE" ||
      !tile?.isConnected ||
      !presentationAlertId ||
      !presentationAlertSeq ||
      !presentationEventId
    ) {
      return;
    }
    void recordDashboardPresentation(
      {
        id: presentationAlertId,
        alertSeq: presentationAlertSeq,
        backendEventId: presentationEventId,
      },
      surface,
    ).catch(() => undefined);
  }, [level, presentationAlertId, presentationAlertSeq, presentationEventId, surface]);

  return (
    <button
      ref={tileRef}
      type="button"
      aria-label={`${space.name} ${isDisconnected ? "연결 끊김" : STATUS_WORD[level]}`}
      onClick={() => onSelect?.(space)}
      style={style}
      data-flip-key={flipKey}
      data-alert-id={presentationAlert?.id}
      data-backend-event-id={presentationAlert?.backendEventId ?? undefined}
      data-space-id={space.id}
      data-status={level}
      data-connection={status?.connection ?? "STALE"}
      className={`relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-2xl ${cardSize === "xl" ? "p-7" : "p-5"} text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-card focus:outline-none focus-visible:ring-4 focus-visible:ring-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        layout === "overview" && isDanger ? "border-l-8 border-status-danger" : ""
      } ${
        layout === "overview" && isCheck ? "border-l-8 border-status-check" : ""
      } ${fillFor(level)} ${textFor(level)} ${selected ? "ring-4 ring-brand" : ""} ${pulseClassFor(pulseTone)}`}
    >
      {isDisconnected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-surface2/80 [background-image:repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(0,0,0,0.08)_8px,rgba(0,0,0,0.08)_16px)]"
        />
      )}
      {!isDisconnected && isDanger && <StatusPulseRing tone="danger" />}
      {!isDisconnected && isSafe && <StatusPulseRing tone="safe" />}
      <span className="relative flex items-center gap-2 text-staff-status">
        <Icon className="h-7 w-7 shrink-0 2xl:h-9 2xl:w-9" aria-hidden />
        <span>{isDisconnected ? "연결 끊김" : STATUS_WORD[level]}</span>
      </span>
      <span className={`${hero ? "flex flex-1 flex-col items-center justify-center text-center" : "block"} relative mt-4`}>
        <span className={`${hero ? "text-5xl 2xl:text-6xl" : "text-3xl 2xl:text-4xl"} block break-keep line-clamp-2 font-black tracking-tight`}>{space.name}</span>
        {hero && (
          <span className="mt-3 text-staff-status font-black">
            {isDisconnected ? "연결 끊김" : STATUS_WORD[level]}
          </span>
        )}
        {level !== "STABLE" && status?.aiSummary && <span className={`${hero ? "mt-3" : "mt-1.5"} line-clamp-2 block text-staff-body font-bold opacity-90`}>{status.aiSummary}</span>}
        {recentDetectedAt && <span className="mt-3 block text-staff-body font-black opacity-75">최근 감지 {recentDetectedAt}</span>}
      </span>
    </button>
  );
}


function fillFor(status: SpaceStatusLevel): string {
  if (status === "DANGER") return "bg-status-dangerBg";
  if (status === "CHECK_NEEDED") return "bg-status-checkBg";
  if (status === "CAUTION") return "bg-status-cautionBg";
  return "bg-surface border border-border";
}

function textFor(status: SpaceStatusLevel): string {
  if (status === "DANGER") return "text-status-danger";
  if (status === "CHECK_NEEDED") return "text-status-check";
  if (status === "CAUTION") return "text-status-caution";
  return "text-ink";
}

function iconFor(status: SpaceStatusLevel) {
  if (status === "DANGER") return AlertTriangle;
  if (status === "CHECK_NEEDED") return HelpCircle;
  if (status === "CAUTION") return ShieldCheck;
  return CheckCircle2;
}
