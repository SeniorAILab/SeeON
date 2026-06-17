import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getFrontSession } from "../../../lib/session";
import { AlertFeed } from "../../../components/AlertFeed";
import type { SseAlert, ResidentStatus } from "../../../lib/sse-utils";
import { BACKEND_ORIGIN as backendOrigin } from "../../../lib/config";

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

export default async function DashboardPage() {
  const session = await getFrontSession();
  if (!session) redirect("/login");
  if (!session.user.orgId) redirect("/onboarding");

  const cookieHeader = (await cookies()).toString();

  const [initialStatuses, initialAlerts] = await Promise.all([
    fetchJson<ResidentStatus[]>(`${backendOrigin}/api/status`, cookieHeader),
    fetchJson<SseAlert[]>(
      `${backendOrigin}/api/alerts?limit=20`,
      cookieHeader,
    ),
  ]);

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
            NOC Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-bold">시설 실시간 모니터링</h1>
          <p className="mt-1 text-xs text-slate-500">
            org: {session.user.orgId}
          </p>
        </div>
        <AlertFeed
          initialAlerts={initialAlerts ?? []}
          initialStatuses={initialStatuses ?? []}
        />
      </div>
    </div>
  );
}
