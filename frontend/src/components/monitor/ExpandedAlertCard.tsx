import { Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LargeRiskBadge } from "./LargeRiskBadge";
import { AcknowledgementButton } from "./AcknowledgementButton";
import { peoplePhrase } from "@/lib/staffCopy";
import type { Floor, Space, SpaceStatus } from "@/types";

/**
 * 확대 강조 카드.
 *  - emphasis="caution" : 주의 (기존보다 ~1.5배)
 *  - emphasis="danger"  : 위험 (~2배, 강한 강조)
 */
export function ExpandedAlertCard({
  space,
  floor,
  status,
  emphasis,
  onAck,
  onDetail,
}: {
  space: Space;
  floor?: Floor;
  status?: SpaceStatus;
  emphasis: "caution" | "danger";
  onAck: () => void;
  onDetail: () => void;
}) {
  const danger = emphasis === "danger";
  const level = status?.status ?? "CAUTION";

  return (
    <div
      className={cn(
        "rounded-3xl border-4 p-6 2xl:p-8",
        danger
          ? "border-status-danger bg-status-dangerBg animate-pulse-danger"
          : "border-status-caution bg-status-cautionBg"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className={cn("font-extrabold leading-none text-ink", danger ? "text-6xl 2xl:text-7xl" : "text-5xl")}>
            {space.name}
          </h3>
          {floor && <span className="text-2xl text-ink-faint">{floor.name}</span>}
        </div>
        <LargeRiskBadge status={level} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Users className={danger ? "h-12 w-12 text-ink-faint" : "h-10 w-10 text-ink-faint"} />
        <span className={cn("font-black tabular-nums text-ink", danger ? "text-6xl" : "text-5xl")}>
          {peoplePhrase(status?.peopleCount ?? 0)}
        </span>
      </div>

      <p className={cn("mt-3 font-bold leading-snug text-ink", danger ? "text-4xl 2xl:text-5xl" : "text-3xl")}>
        {status?.aiSummary}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <AcknowledgementButton onAck={onAck} size={danger ? "lg" : "md"} />
        <button
          onClick={onDetail}
          className="inline-flex min-h-[56px] items-center gap-1.5 rounded-2xl border-2 border-ink/20 px-6 text-2xl font-bold text-ink-soft hover:bg-black/5"
        >
          상세 보기
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
