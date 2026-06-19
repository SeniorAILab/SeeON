// Pure, server-safe derivations for the dashboard charts.
//
// The backend exposes NO stats/aggregation endpoint (verified across all 9
// controllers) and Alert.type is a freeform string. So every chart is derived
// from the raw alert snapshot the page already fetched — we surface only what
// the real API actually returns, never fabricated metrics.
import type { SseAlert } from "./sse-utils";

export type TrendPoint = { hour: number; total: number; fall: number };
export type TypeSlice = { type: string; label: string; count: number };

// ponytail: fixed KST offset (Korea has no DST, so +9h is exact) keeps hour
// bucketing deterministic across SSR regardless of server TZ — no Date-tz guess.
const KST_OFFSET_MS = 9 * 3_600_000;

function kstHour(iso: string): number {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).getUTCHours();
}

// ponytail: groups the in-memory snapshot (page fetches <=100; no count API
// exists). Accurate at the demo's day scale. Upgrade path: a server-side
// aggregation endpoint removes the snapshot-size ceiling.
export function hourlyTrend(alerts: SseAlert[]): TrendPoint[] {
  const buckets: TrendPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: 0,
    fall: 0,
  }));
  for (const a of alerts) {
    const b = buckets[kstHour(a.detectedAt)];
    b.total += 1;
    if (a.type === "FALL") b.fall += 1;
  }
  return buckets;
}

// Groups by the REAL freeform type values (FALL/BED_EXIT/NO_MOTION/...),
// labelled via the shared ALERT_TYPE_LABELS map — no invented categories.
export function typeBreakdown(
  alerts: SseAlert[],
  label: (type: string) => string,
): TypeSlice[] {
  const counts = new Map<string, number>();
  for (const a of alerts) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, label: label(type), count }))
    .sort((a, b) => b.count - a.count);
}
