import { cn } from "@/lib/utils";
import { statusWord } from "@/lib/staffCopy";
import type { Space, SpaceStatus } from "@/types";

// 평상시 압축형 카드 — 작고 조용하게. 공간명/인원/상태색만.
const dot: Record<SpaceStatus["status"], string> = {
  STABLE: "bg-status-stable",
  CAUTION: "bg-status-caution",
  DANGER: "bg-status-danger",
  CHECK_NEEDED: "bg-status-check",
};
const ring: Record<SpaceStatus["status"], string> = {
  STABLE: "border-border bg-surface",
  CAUTION: "border-status-caution/50 bg-status-cautionBg",
  DANGER: "border-status-danger/60 bg-status-dangerBg",
  CHECK_NEEDED: "border-status-check/40 bg-status-checkBg",
};

export function CompactSpaceCard({
  space,
  status,
  dimmed,
  onClick,
}: {
  space: Space;
  status?: SpaceStatus;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const level = status?.status ?? "CHECK_NEEDED";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-opacity",
        ring[level],
        dimmed && "opacity-40"
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-xl font-extrabold text-ink 2xl:text-2xl">{space.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
          <span className={cn("h-2.5 w-2.5 rounded-full", dot[level])} />
          {statusWord[level]}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <span className="text-3xl font-black tabular-nums text-ink 2xl:text-4xl">
          {status?.peopleCount ?? 0}
        </span>
        <span className="text-base font-bold text-ink-soft">명</span>
      </div>
    </button>
  );
}
