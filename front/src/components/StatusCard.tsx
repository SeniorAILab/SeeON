import { ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { spaceTypeLabel } from "@/lib/labels";
import { StatusBadge } from "./StatusBadge";
import { RiskBadge } from "./RiskBadge";
import { PeopleCountIndicator } from "./PeopleCountIndicator";
import { KakaoAlertStatusBadge } from "./KakaoAlertStatusBadge";
import type { Floor, Space, SpaceStatus } from "@/types";

// 상태별 좌측 강조 바 색
const accent: Record<SpaceStatus["status"], string> = {
  STABLE: "before:bg-status-stable",
  CAUTION: "before:bg-status-caution",
  DANGER: "before:bg-status-danger",
  CHECK_NEEDED: "before:bg-status-check",
};

export function StatusCard({
  space,
  floor,
  status,
  onClick,
}: {
  space: Space;
  floor?: Floor;
  status?: SpaceStatus;
  onClick?: () => void;
}) {
  const level = status?.status ?? "CHECK_NEEDED";
  const isDanger = level === "DANGER";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-border bg-surface p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-1",
        accent[level],
        isDanger && "animate-pulse-danger ring-1 ring-status-danger/30"
      )}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{space.name}</h3>
            <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5" />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
            <MapPin className="h-3 w-3" />
            {floor?.name} · {spaceTypeLabel[space.type]}
          </p>
        </div>
        <StatusBadge status={level} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <PeopleCountIndicator count={status?.peopleCount ?? 0} capacity={space.capacity} />
        {status && <RiskBadge level={status.fallRiskLevel} />}
      </div>

      <p className="mb-3 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-ink-soft">
        {status?.aiSummary ?? "상태 정보를 불러오는 중입니다."}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {status ? `${timeAgo(status.lastDetectedAt)} 업데이트` : "—"}
        </span>
        {status && <KakaoAlertStatusBadge status={status.kakaoAlertStatus} />}
      </div>
    </button>
  );
}
