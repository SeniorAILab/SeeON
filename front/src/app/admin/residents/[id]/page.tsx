"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";
import { useDemoRole } from "../../../../lib/useDemoRole";
import { canSeeFullPhone } from "../../../../lib/mock/session";
import type { DemoCamera, DemoGuardian, DemoResident } from "../../../../lib/mock/types";
import type { ResidentStatus, SseAlert } from "../../../../lib/sse-utils";
import {
  ALERT_STATUS_LABELS,
  ALERT_TYPE_LABELS,
  formatTime,
  maskPhone,
} from "../../../../lib/sse-utils";

interface ResidentDetail extends DemoResident {
  guardians: DemoGuardian[];
  cameras: DemoCamera[];
  status: ResidentStatus | null;
  alerts: SseAlert[];
}

const STATE_LABELS: Record<string, string> = {
  NORMAL: "안정",
  WARNING: "주의",
  FALL: "긴급",
};

const STATE_CLASS: Record<string, string> = {
  NORMAL: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  WARNING: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  FALL: "border-red-400/30 bg-red-400/10 text-red-200",
};

function riskNote(detail: ResidentDetail): string {
  if (detail.status?.state === "FALL") {
    return "최근 자세 흐름에서 급격한 하강과 정지 패턴이 감지되어 즉시 확인이 필요합니다.";
  }
  if (detail.status?.state === "WARNING") {
    return "움직임 변화가 평소보다 커져 낙상 위험을 낮추기 위한 관찰을 권장합니다.";
  }
  return "자세 변화와 활동 흐름이 안정 범위에 있어 정기 관찰을 유지하면 됩니다.";
}

export default function ResidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const role = useDemoRole();
  const canViewFullPhone = canSeeFullPhone(role);
  const [detail, setDetail] = useState<ResidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ResidentDetail>(`/api/residents/${id}`)
      .then((data) => {
        if (cancelled) return;
        // Normalize so a non-demo backend shape (missing relations) cannot crash render.
        setDetail({
          ...data,
          guardians: data.guardians ?? [],
          cameras: data.cameras ?? [],
          alerts: data.alerts ?? [],
          status: data.status ?? null,
        });
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              대상자 상세
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {detail?.name ?? "대상자 정보"}
            </h1>
          </div>
          <Link
            href="/admin/residents"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대상자 목록
          </Link>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <span className="text-sm text-slate-500">로딩 중...</span>
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {detail && !loading && !error && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">프로필</h2>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    STATE_CLASS[detail.status?.state ?? "NORMAL"] ?? STATE_CLASS.NORMAL
                  }`}
                >
                  현재 상태: {STATE_LABELS[detail.status?.state ?? "NORMAL"] ?? "확인 중"}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">이름</dt>
                  <dd className="mt-1 text-white">{detail.name}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">호실</dt>
                  <dd className="mt-1 text-white">{detail.room}호</dd>
                </div>
                <div>
                  <dt className="text-slate-500">출생연도</dt>
                  <dd className="mt-1 text-white">{detail.birthYear}년</dd>
                </div>
                <div>
                  <dt className="text-slate-500">장기요양등급</dt>
                  <dd className="mt-1 text-white">{detail.careLevel}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">입소일</dt>
                  <dd className="mt-1 text-white">
                    {formatTime(detail.admittedAt, { dateStyle: "medium" })}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                {riskNote(detail)}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-4 text-lg font-semibold">담당 카메라</h2>
              <div className="space-y-3">
                {detail.cameras.length === 0 && (
                  <p className="text-sm text-slate-500">연결된 카메라가 없습니다</p>
                )}
                {detail.cameras.map((camera) => (
                  <div key={camera.id} className="rounded-xl bg-slate-900/70 p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{camera.label}</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          camera.online ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                      />
                      <span className="text-xs text-slate-400">
                        {camera.online ? "온라인" : "오프라인"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      마지막 확인: {camera.lastSeenAt ? formatTime(camera.lastSeenAt) : "기록 없음"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-4 text-lg font-semibold">보호자 연락처</h2>
              <div className="space-y-3">
                {detail.guardians.length === 0 && (
                  <p className="text-sm text-slate-500">등록된 보호자가 없습니다</p>
                )}
                {detail.guardians.map((guardian) => (
                  <div key={guardian.id} className="rounded-xl bg-slate-900/70 p-4">
                    <p className="font-medium text-white">{guardian.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{guardian.relation}</p>
                    <p className="mt-2 text-sm text-slate-200">
                      {canViewFullPhone ? guardian.phone : maskPhone(guardian.phone)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-4 text-lg font-semibold">최근 알림</h2>
              <div className="space-y-3">
                {detail.alerts.length === 0 && (
                  <p className="text-sm text-slate-500">최근 알림이 없습니다</p>
                )}
                {detail.alerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/alerts/${alert.id}`}
                    className="block rounded-xl bg-slate-900/70 p-4 transition hover:bg-cyan-400/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">
                        {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                      </p>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                        {ALERT_STATUS_LABELS[alert.status] ?? alert.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">
                      신뢰도 {Math.round(alert.probability * 100)}% · {formatTime(alert.detectedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
