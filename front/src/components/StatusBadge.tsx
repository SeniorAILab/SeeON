"use client";

import type { ResidentState } from "../lib/sse-utils";

interface Config {
  label: string;
  dotClass: string;
  badgeClass: string;
}

const STATE_CONFIG: Record<ResidentState, Config> = {
  NORMAL: {
    label: "정상",
    dotClass: "bg-emerald-400",
    badgeClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  WARNING: {
    label: "경고",
    dotClass: "bg-amber-400",
    badgeClass:
      "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  FALL: {
    label: "낙상",
    dotClass: "bg-red-400 animate-pulse",
    badgeClass:
      "border-red-500/30 bg-red-500/10 text-red-300 animate-pulse",
  },
};

export function StatusBadge({ state }: { state: ResidentState }) {
  const { label, dotClass, badgeClass } = STATE_CONFIG[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
