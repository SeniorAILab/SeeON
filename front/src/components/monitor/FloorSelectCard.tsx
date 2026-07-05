interface FloorSelectCardProps {
  floorName: string;
  alertCount: number;
  onSelect: () => void;
}

export function FloorSelectCard({ floorName, alertCount, onSelect }: FloorSelectCardProps) {
  const badgeClassName =
    alertCount > 0
      ? "bg-status-dangerBg text-status-danger"
      : "bg-surface2 text-ink-soft";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${floorName} 이동, 위험 ${alertCount}건`}
      className="flex h-full min-h-28 w-full items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-card focus:outline-none focus-visible:ring-4 focus-visible:ring-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-32 2xl:min-h-36 2xl:p-8"
    >
      <span className="break-keep text-staff-name font-black text-ink">{floorName}</span>
      <span className={`shrink-0 rounded-full px-4 py-2 text-staff-status font-black ${badgeClassName}`}>
        위험 {alertCount}건
      </span>
    </button>
  );
}
