"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../../lib/api";
import { useDemoRole } from "../../../../../lib/useDemoRole";
import { canSeeFullPhone } from "../../../../../lib/mock/session";
import type { ResidentStatus, SseAlert } from "../../../../../lib/sse-utils";
import {
  ALERT_STATUS_LABELS,
  ALERT_TYPE_LABELS,
  formatTime,
  maskPhone,
} from "../../../../../lib/sse-utils";

interface Guardian {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

interface Camera {
  id: string;
  label: string;
  online: boolean;
  lastSeenAt: string | null;
}

// Flat shape returned by real backend GET /api/residents/:id
interface ResidentFlat {
  id: string;
  name: string;
  room: string | null;
  createdAt?: string;
}

function riskNote(status: ResidentStatus | null): string {
  if (status?.state === "FALL") {
    return "최근 자세 흐름에서 급격한 하강과 정지 패턴이 감지되어 즉시 확인이 필요합니다.";
  }
  if (status?.state === "WARNING") {
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

  const [resident, setResident] = useState<ResidentFlat | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [status, setStatus] = useState<ResidentStatus | null>(null);
  const [alerts, setAlerts] = useState<SseAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // ponytail: compose detail from 5 separate real-backend endpoints in parallel;
    // status 404s gracefully (resident may have no sensor data yet).
    Promise.all([
      api.get<ResidentFlat>(`/api/residents/${id}`),
      api.get<Guardian[]>(`/api/guardians?residentId=${id}`),
      api.get<Camera[]>(`/api/cameras?residentId=${id}`),
      api.get<ResidentStatus>(`/api/status/${id}`).catch(() => null),
      api.get<SseAlert[]>(`/api/alerts?residentId=${id}&limit=20`),
    ])
      .then(([r, g, cam, st, al]) => {
        if (cancelled) return;
        setResident(r);
        setGuardians(g ?? []);
        setCameras(cam ?? []);
        setStatus(st);
        setAlerts(al ?? []);
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
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">Admin / 대상자</p>
            <h1 className="mt-1 text-balance text-2xl font-bold text-ink">
              {resident?.name ?? "대상자 정보"}
            </h1>
          </div>
          <Link
            href="/admin/residents"
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            ← 대상자 목록
          </Link>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <span className="text-sm text-muted">로딩 중...</span>
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl border border-danger/20 bg-danger-weak p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {resident && !loading && !error && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Profile */}
            <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-ink">프로필</h2>
                  <p className="mt-0.5 text-xs text-muted">기본 정보 및 현재 상태</p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    ({ NORMAL: "border-ok/30 bg-ok-weak text-ok", WARNING: "border-warn/30 bg-warn-weak text-warn", FALL: "border-danger/30 bg-danger-weak text-danger" } as Record<string, string>)[status?.state ?? "NORMAL"] ?? "border-ok/30 bg-ok-weak text-ok"
                  }`}
                >
                  {({ NORMAL: "안정", WARNING: "주의", FALL: "긴급" } as Record<string, string>)[status?.state ?? "NORMAL"] ?? "확인 중"}
                </span>
              </div>
              {/* ponytail: birthYear / careLevel / admittedAt removed — not in real backend Resident */}
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted">이름</dt>
                  <dd className="mt-1 font-medium text-ink">{resident.name}</dd>
                </div>
                <div>
                  <dt className="text-muted">호실</dt>
                  <dd className="mt-1 text-ink tabular-nums">
                    {resident.room ? `${resident.room}호` : "미지정"}
                  </dd>
                </div>
                {resident.createdAt && (
                  <div className="col-span-2">
                    <dt className="text-muted">등록일</dt>
                    <dd className="mt-1 text-ink">
                      {formatTime(resident.createdAt, { dateStyle: "medium" })}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-5 rounded-xl border border-brand/20 bg-brand-weak p-4 text-sm text-pretty text-ink-2">
                {riskNote(status)}
              </div>
            </section>

            {/* Cameras */}
            <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-base font-bold text-ink">담당 카메라</h2>
              <p className="mt-0.5 mb-4 text-xs text-muted">연결된 카메라 상태</p>
              <div className="space-y-3">
                {cameras.length === 0 && (
                  <p className="text-sm text-muted">연결된 카메라가 없습니다</p>
                )}
                {cameras.map((camera) => (
                  <div key={camera.id} className="rounded-xl border border-line bg-surface-2 p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{camera.label}</span>
                      <span
                        className={`size-2 rounded-full ${
                          camera.online ? "bg-ok" : "bg-muted"
                        }`}
                      />
                      <span className="text-xs text-ink-2">
                        {camera.online ? "온라인" : "오프라인"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      마지막 확인:{" "}
                      {camera.lastSeenAt ? formatTime(camera.lastSeenAt) : "기록 없음"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Guardians */}
            <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-base font-bold text-ink">보호자 연락처</h2>
              <p className="mt-0.5 mb-4 text-xs text-muted">등록된 보호자 정보</p>
              <div className="space-y-3">
                {guardians.length === 0 && (
                  <p className="text-sm text-muted">등록된 보호자가 없습니다</p>
                )}
                {guardians.map((guardian) => (
                  <div
                    key={guardian.id}
                    className="rounded-xl border border-line bg-surface-2 p-4"
                  >
                    <p className="font-medium text-ink">{guardian.name}</p>
                    <p className="mt-1 text-sm text-ink-2">{guardian.relation}</p>
                    <p className="mt-2 text-sm tabular-nums text-ink">
                      {canViewFullPhone ? guardian.phone : maskPhone(guardian.phone)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent alerts */}
            <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-base font-bold text-ink">최근 알림</h2>
              <p className="mt-0.5 mb-4 text-xs text-muted">최근 20건</p>
              <div className="space-y-3">
                {alerts.length === 0 && (
                  <p className="text-sm text-muted">최근 알림이 없습니다</p>
                )}
                {alerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/alerts/${alert.id}`}
                    className="block rounded-xl border border-line bg-surface-2 p-4 transition hover:bg-brand-weak"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">
                        {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                      </p>
                      <span className="rounded-full border border-line bg-surface px-2 py-1 text-xs text-ink-2">
                        {ALERT_STATUS_LABELS[alert.status] ?? alert.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm tabular-nums text-ink-2">
                      신뢰도 {Math.round(alert.probability * 100)}% ·{" "}
                      {formatTime(alert.detectedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
