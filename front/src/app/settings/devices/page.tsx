import Link from "next/link";

import { CAMERAS, RESIDENTS } from "../../../lib/mock/fixtures";
import { formatTime } from "../../../lib/sse-utils";

function residentName(residentId: string | null) {
  if (!residentId) return "미지정";
  const resident = RESIDENTS.find((item) => item.id === residentId);
  return resident ? `${resident.name} · ${resident.room}호` : "미지정";
}

export default function DevicesSettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              설정
            </p>
            <h1 className="mt-1 text-2xl font-bold">장치</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대시보드
          </Link>
        </div>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-slate-950/20">
          <div className="grid grid-cols-5 gap-4 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>장치명</span>
            <span>배정</span>
            <span>상태</span>
            <span>최근 신호</span>
            <span>수집 키</span>
          </div>
          {CAMERAS.map((camera) => (
            <div
              key={camera.id}
              className="grid grid-cols-5 gap-4 border-b border-white/5 px-5 py-4 text-sm last:border-b-0"
            >
              <span className="font-semibold text-white">{camera.label}</span>
              <span className="text-slate-300">{residentName(camera.residentId)}</span>
              <span>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                    camera.online
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-red-400/15 text-red-300"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      camera.online ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  {camera.online ? "온라인" : "오프라인"}
                </span>
              </span>
              <span className="text-slate-400">
                {camera.lastSeenAt ? formatTime(camera.lastSeenAt) : "기록 없음"}
              </span>
              <span className="flex items-center justify-between gap-3 text-slate-400">
                <code className="rounded bg-slate-900/80 px-2 py-1 text-xs text-cyan-200">
                  {camera.ingestKeyId}
                </code>
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-slate-500"
                >
                  시크릿 재발급
                </button>
              </span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
