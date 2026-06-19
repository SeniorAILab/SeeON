import { cookies } from "next/headers";
import { AlertFeed } from "../../../components/AlertFeed";
import type { ResidentStatus, SseAlert } from "../../../lib/sse-utils";
import { BACKEND_ORIGIN as backendOrigin, isServerDemo } from "../../../lib/config";
import { serverAlerts, serverStatuses } from "../../../lib/mock/server-snapshot";
import { fetchJson } from "../../../lib/server-fetch";

function ZoneKpi({
  label,
  value,
  cls = "text-ink",
}: {
  label: string;
  value: number;
  cls?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <p className={`text-3xl font-bold tabular-nums ${cls}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

export default async function MonitoringPage() {
  let statuses: ResidentStatus[];
  let alerts: SseAlert[];

  if (isServerDemo()) {
    statuses = serverStatuses();
    // ponytail: 20 alerts is enough for the initial SSE feed snapshot; no
    // aggregation endpoint exists, so counts derive from the status list below.
    alerts = serverAlerts(20);
  } else {
    const cookieHeader = (await cookies()).toString();
    const [s, a] = await Promise.all([
      fetchJson<ResidentStatus[]>(`${backendOrigin}/api/status`, cookieHeader),
      fetchJson<SseAlert[]>(`${backendOrigin}/api/alerts?limit=20`, cookieHeader),
    ]);
    statuses = s ?? [];
    alerts = a ?? [];
  }

  // All counts derived from the fetched status list only — no fabricated aggregates.
  const total = statuses.length;
  const fallCount = statuses.filter((s) => s.state === "FALL").length;
  const warnCount = statuses.filter((s) => s.state === "WARNING").length;
  const camsOnline = statuses.filter((s) => s.cameraOnline).length;

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Zone board header */}
        <div className="mb-6">
          <h1 className="text-balance text-2xl font-bold text-ink">실시간 모니터링</h1>
          <p className="mt-0.5 text-xs text-muted">
            입소자 구역별 실시간 낙상·안전 상태
          </p>
        </div>

        {/* KPI summary strip — counts from real fetched status list only */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ZoneKpi label="전체 입소자" value={total} />
          <ZoneKpi
            label="낙상 감지"
            value={fallCount}
            cls={fallCount > 0 ? "text-danger" : "text-ink"}
          />
          <ZoneKpi
            label="경고 상태"
            value={warnCount}
            cls={warnCount > 0 ? "text-warn" : "text-ink"}
          />
          <ZoneKpi label="카메라 온라인" value={camsOnline} cls="text-ok" />
        </div>

        {/* Live zone board — AlertFeed owns SSE wiring, StatusGrid, camera dots,
            and the connection indicator. initialStatuses seeds the grid until the
            SSE status-snapshot frame arrives on connect. */}
        <AlertFeed initialAlerts={alerts} initialStatuses={statuses} />
      </div>
    </div>
  );
}
