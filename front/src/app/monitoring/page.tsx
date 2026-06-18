import Link from "next/link";

import { serverStatuses } from "../../lib/mock/server-snapshot";
import { formatTime, type ResidentState } from "../../lib/sse-utils";

const STATE_STYLES: Record<ResidentState, { label: string; className: string }> = {
  NORMAL: {
    label: "정상",
    className: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  },
  WARNING: {
    label: "경고",
    className: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  },
  FALL: {
    label: "낙상",
    className: "bg-red-400/15 text-red-300 ring-red-400/30",
  },
};

export default function MonitoringPage() {
  const statuses = serverStatuses();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              실시간 상태
            </p>
            <h1 className="mt-1 text-2xl font-bold">실시간 모니터링</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statuses.map((status) => {
            const stateStyle = STATE_STYLES[status.state];
            return (
              <article
                key={status.residentId}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">
                      {status.resident?.name ?? "미지정"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {status.resident?.room ?? "--"}호
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${stateStyle.className}`}
                  >
                    {stateStyle.label}
                  </span>
                </div>

                <div className="mt-5 flex items-center gap-2 text-sm text-slate-300">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      status.cameraOnline ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  카메라 {status.cameraOnline ? "연결됨" : "연결 끊김"}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  최근 감지 {status.lastSeenAt ? formatTime(status.lastSeenAt) : "기록 없음"}
                </p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
