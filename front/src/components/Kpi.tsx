const KPI_ICONS = {
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  fall: "M12 2v6m0 0 3-3m-3 3L9 5M5 13a7 7 0 1 0 14 0",
  watch: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  camera: "M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 4v-11z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  check: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  inbox: "M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z",
} as const;

const TONES = {
  brand: { chip: "bg-brand-weak text-brand-ink", strong: "text-brand-ink" },
  danger: { chip: "bg-danger-weak text-danger", strong: "text-danger" },
  warn: { chip: "bg-warn-weak text-warn", strong: "text-warn" },
  ok: { chip: "bg-ok-weak text-ok", strong: "text-ok" },
} as const;

export function Kpi({
  label,
  value,
  icon,
  tone = "brand",
  alarm,
}: {
  label: string;
  value: number | string;
  icon: keyof typeof KPI_ICONS;
  tone?: keyof typeof TONES;
  alarm?: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <span className={`grid size-10 place-items-center rounded-xl ${TONES[tone].chip}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
          <path d={KPI_ICONS[icon]} />
        </svg>
      </span>
      <p className={`mt-4 text-3xl font-bold tabular-nums ${alarm ? TONES[tone].strong : "text-ink"}`}>
        {value}
      </p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
