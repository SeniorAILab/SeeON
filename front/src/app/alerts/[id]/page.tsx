"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api";
import type { SseAlert } from "../../../lib/sse-utils";
import { SnapshotThumb } from "../../../components/SnapshotThumb";

const STATUS_LABELS: Record<string, string> = {
  NEW: "신규",
  ACKED: "확인됨",
  RESOLVED: "해결됨",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className="text-sm text-slate-200">{value}</span>
    </div>
  );
}

export default function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [alert, setAlert] = useState<SseAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SseAlert>(`/api/alerts/${id}`)
      .then((data) => {
        if (cancelled) return;
        setAlert(data);
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

  async function handleAck() {
    if (!alert || alert.status !== "NEW") return;
    setAcking(true);
    try {
      const updated = await api.patch<SseAlert>(`/api/alerts/${id}/ack`, {});
      setAlert(updated);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : "확인 처리 중 오류가 발생했습니다",
      );
    } finally {
      setAcking(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/alerts"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 알림 이력
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
            Alert Detail
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <span className="text-sm text-slate-500">로딩 중...</span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {alert && !loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-xl font-bold">
                {alert.resident?.name ?? "대상자 미상"}
              </h1>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  alert.status === "NEW"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-slate-700 text-slate-300"
                }`}
              >
                {STATUS_LABELS[alert.status] ?? alert.status}
              </span>
            </div>

            <div className="mb-6">
              <SnapshotThumb
                alertId={alert.id}
                snapshotKey={alert.snapshotKey}
                className="h-48 w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="대상자 ID"
                value={
                  <span className="font-mono text-xs">
                    {alert.residentId}
                  </span>
                }
              />
              {alert.resident?.room && (
                <Field label="호실" value={`${alert.resident.room}호`} />
              )}
              <Field
                label="신뢰도"
                value={`${Math.round(alert.probability * 100)}%`}
              />
              <Field label="유형" value={alert.type} />
              <Field
                label="감지 시각"
                value={new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "long",
                  timeStyle: "medium",
                }).format(new Date(alert.detectedAt))}
              />
              <Field
                label="alertSeq"
                value={
                  <span className="font-mono text-xs">{alert.alertSeq}</span>
                }
              />
              {alert.cameraId && (
                <Field
                  label="카메라 ID"
                  value={
                    <span className="font-mono text-xs">{alert.cameraId}</span>
                  }
                />
              )}
            </div>

            {alert.status === "NEW" && (
              <div className="mt-6">
                <button
                  onClick={handleAck}
                  disabled={acking}
                  className="w-full rounded-xl bg-cyan-700 py-3 text-sm font-semibold transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {acking ? "처리 중..." : "확인 처리 (ACK)"}
                </button>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-xl bg-red-900/30 p-3 text-sm text-red-400">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
