import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/types";

interface StatItem {
  key: string;
  label: string;
  value: number;
  color: string;
  filter?: string;
}

export function StatsBar({
  summary,
  activeFilter,
  onFilter,
  onUnacknowledgedClick,
}: {
  summary: DashboardSummary;
  activeFilter: string;
  onFilter: (f: string) => void;
  onUnacknowledgedClick?: () => void;
}) {
  const items: StatItem[] = [
    { key: "ALL", label: "전체 공간", value: summary.totalSpaces, color: "text-ink", filter: "ALL" },
    { key: "STABLE", label: "안정", value: summary.stable, color: "text-status-stable", filter: "STABLE" },
    { key: "CAUTION", label: "주의", value: summary.caution, color: "text-status-caution", filter: "CAUTION" },
    { key: "DANGER", label: "위험", value: summary.danger, color: "text-status-danger", filter: "DANGER" },
    { key: "CHECK_NEEDED", label: "확인 필요", value: summary.checkNeeded, color: "text-status-check", filter: "CHECK_NEEDED" },
    { key: "UNACK", label: "미확인 이벤트", value: summary.unacknowledged, color: "text-brand" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const isUnacknowledged = it.key === "UNACK";
        const clickable = !!it.filter || (isUnacknowledged && it.value > 0 && !!onUnacknowledgedClick);
        const active = !!it.filter && activeFilter === it.filter;
        const className = cn(
          "rounded-xl border bg-surface px-4 py-3 text-left shadow-card transition-colors",
          clickable ? "hover:border-brand/40 cursor-pointer" : "cursor-default",
          active ? "border-brand ring-1 ring-brand/30" : "border-border"
        );
        const content = (
          <>
            <div className={cn("text-2xl font-bold tabular-nums", it.color)}>{it.value}</div>
            <div className="mt-0.5 text-xs text-gray-400">{it.label}</div>
          </>
        );

        if (isUnacknowledged && !clickable) {
          return (
            <div key={it.key} className={className}>
              {content}
            </div>
          );
        }

        return (
          <button
            key={it.key}
            onClick={() => (it.filter ? onFilter(it.filter) : onUnacknowledgedClick?.())}
            aria-label={isUnacknowledged ? `${it.label} ${it.value}건 보기` : undefined}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
