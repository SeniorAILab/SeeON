import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getFrontSession } from "../../../lib/session";
import { AlertFeed } from "../../../components/AlertFeed";
import { HeroClock } from "../../../components/HeroClock";
import { TrendArea } from "../../../components/charts/TrendArea";
import { TypeDonut } from "../../../components/charts/TypeDonut";
import type { SseAlert, ResidentStatus } from "../../../lib/sse-utils";
import { ALERT_TYPE_LABELS } from "../../../lib/sse-utils";
import { hourlyTrend, typeBreakdown } from "../../../lib/dashboard-metrics";
import { BACKEND_ORIGIN as backendOrigin, isServerDemo } from "../../../lib/config";
import {
  serverAlerts,
  serverOrg,
  serverStatuses,
} from "../../../lib/mock/server-snapshot";
import { fetchJson } from "../../../lib/server-fetch";

import { Kpi } from "../../../components/Kpi";

export default async function DashboardPage() {
  const session = await getFrontSession();
  if (!session) redirect("/login");
  if (!session.user.orgId) redirect("/onboarding");

  let statuses: ResidentStatus[];
  let alerts: SseAlert[];
  let facility: string | null;

  if (isServerDemo()) {
    // Zero-backend demo: deterministic SSR snapshot; client hydrates the
    // persistent scenario in AlertFeed's stream hook.
    statuses = serverStatuses();
    alerts = serverAlerts(100);
    facility = serverOrg.name;
  } else {
    const cookieHeader = (await cookies()).toString();
    const [s, a] = await Promise.all([
      fetchJson<ResidentStatus[]>(`${backendOrigin}/api/status`, cookieHeader),
      // ponytail: limit 100 (backend max 200, no count API) is plenty for the
      // day-scale charts; a server aggregation endpoint would remove the cap.
      fetchJson<SseAlert[]>(`${backendOrigin}/api/alerts?limit=100`, cookieHeader),
    ]);
    statuses = s ?? [];
    alerts = a ?? [];
    facility = null;
  }

  // All counters/charts derive from the fetched snapshot — no fabricated stats,
  // since the backend exposes no aggregation endpoint.
  const unacked = alerts.filter((a) => a.status === "NEW").length;
  const fallCount = alerts.filter((a) => a.type === "FALL").length;
  const atRisk = statuses.filter((s) => s.state === "FALL").length;
  const attention = statuses.filter((s) => s.state !== "NORMAL").length;
  const residentCount = statuses.length;
  const trend = hourlyTrend(alerts);
  const breakdown = typeBreakdown(alerts, (t) => ALERT_TYPE_LABELS[t] ?? t);

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="relative mb-6 flex flex-col gap-6 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-ink p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="relative z-10">
            <p className="text-sm font-medium text-white/80">실시간 모니터링</p>
            <h1 className="mt-1 text-balance text-2xl font-bold sm:text-3xl">
              {facility ?? "시설 실시간 모니터링"}
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-sm text-white/85">
              영상은 저장하지 않으며 포즈(pose) 데이터만 분석합니다. 입소자 안전을 24시간 지켜봅니다.
            </p>
          </div>
          <div className="relative z-10">
            <HeroClock />
          </div>
          <span className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/10" />
        </section>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="미확인 알림" value={unacked} icon="alert" tone="danger" alarm={unacked > 0} />
          <Kpi label="낙상 감지" value={fallCount} icon="fall" tone="danger" alarm={fallCount > 0} />
          <Kpi label="현재 위험 구역" value={atRisk} icon="watch" tone="danger" alarm={atRisk > 0} />
          <Kpi label="주의·낙상 상태" value={attention} icon="camera" tone="warn" alarm={attention > 0} />
          <Kpi label="입소자" value={residentCount} icon="users" tone="brand" />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.9fr_1fr]">
          <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">시간대별 낙상·알림 추이</h2>
                <p className="mt-0.5 text-xs text-muted">최근 알림 · 시간대(KST) 합산</p>
              </div>
              <div className="flex items-center gap-4 pt-1 text-xs text-ink-2">
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-sm bg-brand" />전체 알림
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-sm bg-danger" />낙상 감지
                </span>
              </div>
            </div>
            <TrendArea data={trend} />
          </section>

          <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink">알림 유형</h2>
            <p className="mt-0.5 mb-2 text-xs text-muted">유형별 분포</p>
            <TypeDonut data={breakdown} />
          </section>
        </div>

        <AlertFeed initialAlerts={alerts.slice(0, 20)} initialStatuses={statuses} />
      </div>
    </div>
  );
}
