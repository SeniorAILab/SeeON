import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getFrontSession } from "../../../lib/session";
import { AlertFeed } from "../../../components/AlertFeed";
import type { SseAlert, ResidentStatus } from "../../../lib/sse-utils";
import { BACKEND_ORIGIN as backendOrigin, isServerDemo } from "../../../lib/config";
import {
  serverAlerts,
  serverOrg,
  serverStatuses,
} from "../../../lib/mock/server-snapshot";

async function fetchJson<T>(url: string, cookieHeader: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-white"}`}>{value}</p>
    </div>
  );
}

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
      fetchJson<SseAlert[]>(`${backendOrigin}/api/alerts?limit=20`, cookieHeader),
    ]);
    statuses = s ?? [];
    alerts = a ?? [];
    facility = null;
  }

  const unacked = alerts.filter((a) => a.status === "NEW").length;
  const fallCount = alerts.filter((a) => a.type === "FALL").length;
  const attention = statuses.filter((s) => s.state !== "NORMAL").length;
  const offlineCameras = statuses.filter((s) => !s.cameraOnline).length;
  const residentCount = statuses.length;

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
            실시간 모니터링
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            {facility ?? "시설 실시간 모니터링"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            영상은 저장하지 않으며 포즈(pose) 데이터만 분석합니다.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="미확인 알림" value={unacked} accent={unacked > 0 ? "text-red-400" : "text-white"} />
          <Kpi label="낙상 감지" value={fallCount} accent={fallCount > 0 ? "text-red-400" : "text-white"} />
          <Kpi label="주의·낙상 상태" value={attention} accent={attention > 0 ? "text-amber-400" : "text-white"} />
          <Kpi label="오프라인 카메라" value={offlineCameras} accent={offlineCameras > 0 ? "text-amber-400" : "text-white"} />
          <Kpi label="입소자" value={residentCount} />
        </div>

        <AlertFeed initialAlerts={alerts.slice(0, 20)} initialStatuses={statuses} />
      </div>
    </div>
  );
}
