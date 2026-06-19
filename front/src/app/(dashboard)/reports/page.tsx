import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getFrontSession } from "../../../lib/session";
import { TrendArea } from "../../../components/charts/TrendArea";
import { TypeDonut } from "../../../components/charts/TypeDonut";
import type { SseAlert } from "../../../lib/sse-utils";
import { ALERT_TYPE_LABELS } from "../../../lib/sse-utils";
import { hourlyTrend, typeBreakdown } from "../../../lib/dashboard-metrics";
import { BACKEND_ORIGIN as backendOrigin, isServerDemo } from "../../../lib/config";
import { serverAlerts } from "../../../lib/mock/server-snapshot";
import { fetchJson } from "../../../lib/server-fetch";
import { Kpi } from "../../../components/Kpi";

export default async function ReportsPage() {
  const session = await getFrontSession();
  if (!session) redirect("/login");
  if (!session.user.orgId) redirect("/onboarding");

  let alerts: SseAlert[];

  if (isServerDemo()) {
    alerts = serverAlerts(100);
  } else {
    const cookieHeader = (await cookies()).toString();
    // ponytail: limit 100 matches dashboard; no aggregation endpoint exists on
    // the backend, so counts are derived from this snapshot only.
    alerts =
      (await fetchJson<SseAlert[]>(
        `${backendOrigin}/api/alerts?limit=100`,
        cookieHeader,
      )) ?? [];
  }

  // All counters derive from the fetched snapshot — no fabricated stats.
  const total = alerts.length;
  const fallCount = alerts.filter((a) => a.type === "FALL").length;
  const unacked = alerts.filter((a) => a.status === "NEW").length;
  const resolved = alerts.filter((a) => a.status === "RESOLVED").length;

  const trend = hourlyTrend(alerts);
  const breakdown = typeBreakdown(alerts, (t) => ALERT_TYPE_LABELS[t] ?? t);
  // ponytail: relative bar widths normalised to the most-frequent type
  const maxCount = breakdown[0]?.count ?? 1;

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-brand">운영 리포트</p>
            <h1 className="mt-1 text-balance text-2xl font-bold text-ink">
              알림 현황 리포트
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              최근 100건 알림 기준 · 실시간 집계
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-muted transition hover:text-ink"
          >
            ← 대시보드
          </Link>
        </div>

        {/* KPI row — counts derived from fetched list only */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="전체 알림" value={total} icon="inbox" tone="brand" />
          <Kpi
            label="낙상 감지"
            value={fallCount}
            icon="fall"
            tone="danger"
            alarm={fallCount > 0}
          />
          <Kpi
            label="미확인 알림"
            value={unacked}
            icon="alert"
            tone="warn"
            alarm={unacked > 0}
          />
          <Kpi label="해결됨" value={resolved} icon="check" tone="ok" />
        </div>

        {/* Charts — same layout as dashboard */}
        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.9fr_1fr]">
          <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">
                  시간대별 알림 추이
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  최근 100건 · 시간대(KST) 합산
                </p>
              </div>
              <div className="flex items-center gap-4 pt-1 text-xs text-ink-2">
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-sm bg-brand" />
                  전체 알림
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-sm bg-danger" />
                  낙상 감지
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

        {/* Type breakdown table */}
        {breakdown.length > 0 && (
          <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink">유형별 상세</h2>
            <p className="mt-0.5 mb-4 text-xs text-muted">
              알림 유형별 발생 건수
            </p>
            <div className="space-y-3">
              {breakdown.map((slice) => (
                <div key={slice.type}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-2">{slice.label}</span>
                    <span className="tabular-nums text-muted">
                      {slice.count}건
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-canvas">
                    <div
                      className="h-2 rounded-full bg-brand"
                      style={{
                        width: `${(slice.count / maxCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
