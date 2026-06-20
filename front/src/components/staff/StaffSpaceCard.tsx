import { Users, ArrowRight, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaffStatusBadge } from "./StaffStatusBadge";
import { peoplePhrase, plainDescription } from "@/lib/staffCopy";
import type { Floor, Space, SpaceStatus } from "@/types";

const band: Record<SpaceStatus["status"], string> = {
  STABLE: "bg-status-stable",
  CAUTION: "bg-status-caution",
  DANGER: "bg-status-danger",
  CHECK_NEEDED: "bg-status-check",
};

/**
 * 직원용 대형 공간 카드.
 * 표시 정보: 공간명 / 상태 / 현재 인원 / 짧은 설명 / 큰 버튼
 * (카메라 ID·신뢰도 등 전문 정보는 직원 화면에 노출하지 않음)
 */
export function StaffSpaceCard({
  space,
  floor,
  status,
  onConfirm,
  onHelp,
  compact = false,
}: {
  space: Space;
  floor?: Floor;
  status?: SpaceStatus;
  onConfirm: () => void;
  onHelp?: () => void;
  compact?: boolean;
}) {
  const level = status?.status ?? "CHECK_NEEDED";
  const isDanger = level === "DANGER";
  const showButtons = level !== "STABLE";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 bg-surface shadow-card",
        isDanger ? "border-status-danger animate-pulse-danger" : "border-border"
      )}
    >
      {/* 좌측 굵은 상태 띠 */}
      <div className={cn("absolute left-0 top-0 h-full w-2.5", band[level])} />

      <div className="py-5 pl-7 pr-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h3 className="text-staff-name text-ink">{space.name}</h3>
            {floor && <span className="text-staff-body text-ink-faint">{floor.name}</span>}
          </div>
          <StaffStatusBadge status={level} size="lg" />
        </div>

        <div className="mt-3 flex items-center gap-2 text-staff-status text-ink">
          <Users className="h-7 w-7 text-ink-faint" />
          {peoplePhrase(status?.peopleCount ?? 0)}
        </div>

        <p className="mt-2 text-staff-body text-ink-soft">
          {status ? plainDescription(status) : "상태를 불러오는 중입니다."}
        </p>

        {showButtons && !compact && (
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={onConfirm}
              className="inline-flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-staff-btn text-white transition-colors hover:brightness-110"
            >
              확인하러 감
              <ArrowRight className="h-6 w-6" />
            </button>
            {isDanger && onHelp && (
              <button
                onClick={onHelp}
                className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-status-danger px-6 text-staff-btn text-white transition-colors hover:brightness-110"
              >
                <Hand className="h-6 w-6" />
                도움 요청
              </button>
            )}
          </div>
        )}

        {compact && showButtons && (
          <button
            onClick={onConfirm}
            className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 text-staff-btn text-white hover:brightness-110"
          >
            확인하러 감
            <ArrowRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}
