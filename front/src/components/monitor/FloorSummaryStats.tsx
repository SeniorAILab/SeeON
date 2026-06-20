import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/types";

/** 층 전체 상태 요약 — 큰 글씨, 멀리서도 읽힘 */
export function FloorSummaryStats({
  summary,
  className,
}: {
  summary: DashboardSummary;
  className?: string;
}) {
  const items = [
    { label: "전체", value: summary.totalSpaces, color: "text-ink" },
    { label: "안정", value: summary.stable, color: "text-status-stable" },
    { label: "주의", value: summary.caution, color: "text-status-caution" },
    { label: "위험", value: summary.danger, color: "text-status-danger" },
  ];
  if (summary.checkNeeded > 0) {
    items.push({ label: "확인 필요", value: summary.checkNeeded, color: "text-status-check" });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1 text-xl 2xl:text-2xl", className)}>
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {i > 0 && <span className="mr-2 text-border">·</span>}
          <span className="text-ink-soft">{it.label}</span>
          <b className={cn("tabular-nums", it.color)}>{it.value}</b>
        </span>
      ))}
    </div>
  );
}
