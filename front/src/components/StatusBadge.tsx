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
    dotClass: "bg-ok",
    badgeClass: "border-ok/30 bg-ok-weak text-ok",
  },
  WARNING: {
    label: "경고",
    dotClass: "bg-warn",
    badgeClass: "border-warn/30 bg-warn-weak text-warn",
  },
  FALL: {
    label: "낙상",
    dotClass: "bg-danger animate-pulse",
    badgeClass: "border-danger/30 bg-danger-weak text-danger animate-pulse",
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
