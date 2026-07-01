import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { LargeRiskBadge } from "./LargeRiskBadge";
import type { Space, SpaceStatus } from "@/types";

// density:
//  comfortable — 공간 적은 층(≤6): 아주 큰 카드
//  compact     — 14공간 층: 작아져도 공간명/인원/상태는 크게 유지
const tone: Record<SpaceStatus["status"], string> = {
  STABLE: "border-status-stable/40 bg-status-stableBg",
  CAUTION: "border-status-caution/60 bg-status-cautionBg animate-pulse-danger",
  DANGER: "border-status-danger bg-status-dangerBg animate-pulse-danger",
  CHECK_NEEDED: "border-status-check/50 bg-status-checkBg",
};

export function MonitorStatusCard({
  space,
  status,
  density = "comfortable",
  onClick,
}: {
  space: Space;
  status?: SpaceStatus;
  density?: "comfortable" | "compact";
  onClick?: () => void;
}) {
  const level = status?.status ?? "CHECK_NEEDED";
  const compact = density === "compact";

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "flex h-full w-full flex-col rounded-2xl border-[3px] p-4 text-left transition-transform hover:scale-[1.02]",
          tone[level]
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="break-keep text-2xl font-extrabold leading-tight text-ink 2xl:text-3xl">{space.name}</h3>
          <LargeRiskBadge status={level} size="md" />
        </div>
        <div className="mt-2 flex items-end gap-1.5">
          <Users className="mb-1 h-6 w-6 text-ink-faint" />
          <span className="text-4xl font-black leading-none tabular-nums text-ink 2xl:text-5xl">
            {status?.peopleCount ?? 0}
          </span>
          <span className="mb-0.5 text-xl font-bold text-ink-soft">명</span>
        </div>
        <p className="mt-2 line-clamp-2 flex-1 text-lg font-semibold leading-snug text-ink-soft 2xl:text-xl">
          {status?.aiSummary ?? "불러오는 중"}
        </p>
        <p className="mt-1.5 text-sm text-ink-faint">
          {status ? timeAgo(status.lastDetectedAt) : "—"}
        </p>
      </button>
    );
  }

  // comfortable
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col rounded-3xl border-4 p-6 text-left transition-transform hover:scale-[1.01] 2xl:p-8",
        tone[level]
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <h3 className="break-keep text-4xl font-extrabold leading-tight text-ink md:text-5xl 2xl:text-6xl">{space.name}</h3>
        <LargeRiskBadge status={level} />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Users className="h-12 w-12 text-ink-faint" />
        <span className="text-7xl font-black leading-none tabular-nums text-ink 2xl:text-8xl">
          {status?.peopleCount ?? 0}
        </span>
        <span className="self-end pb-1 text-3xl font-bold text-ink-soft">명</span>
      </div>
      <p className="mt-4 flex-1 text-3xl font-semibold leading-snug text-ink-soft 2xl:text-4xl">
        {status?.aiSummary ?? "상태를 불러오는 중입니다."}
      </p>
      <p className="mt-4 text-xl text-ink-faint 2xl:text-2xl">
        마지막 감지 {status ? timeAgo(status.lastDetectedAt) : "—"}
      </p>
    </button>
  );
}
