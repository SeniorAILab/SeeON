import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpaceStatusLevel } from "@/types";

const tone: Record<SpaceStatusLevel, string> = {
  STABLE: "border-status-stable/30 bg-status-stableBg",
  CAUTION: "border-status-caution/30 bg-status-cautionBg",
  DANGER: "border-status-danger/30 bg-status-dangerBg",
  CHECK_NEEDED: "border-status-check/30 bg-status-checkBg",
};

/** AI 설명 박스 — 모든 위험 알림에는 AI 설명이 동반되어야 한다(UX 원칙) */
export function AIInsightBox({
  summary,
  status = "STABLE",
  confidence,
  className,
}: {
  summary: string;
  status?: SpaceStatusLevel;
  confidence?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone[status],
        className
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
        <Sparkles className="h-3.5 w-3.5" />
        AI 안전 분석
        {confidence != null && (
          <span className="ml-auto font-normal text-gray-400">
            신뢰도 {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-ink">{summary}</p>
    </div>
  );
}
