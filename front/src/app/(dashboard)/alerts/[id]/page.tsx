"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { api, ApiError } from "../../../../lib/api";
import type { SseAlert } from "../../../../lib/sse-utils";
import { ALERT_STATUS_LABELS, ALERT_TYPE_LABELS, formatTime } from "../../../../lib/sse-utils";
import { IS_DEMO } from "../../../../lib/config";
import { SnapshotThumb } from "../../../../components/SnapshotThumb";
import { PoseFrameCard } from "../../../../components/PoseFrameCard";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">
        {label}
      </span>
      <span className="text-sm text-ink">{value}</span>
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
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/alerts"
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            ← 알림 목록
          </Link>
          <p className="text-sm font-medium text-brand">
            알림 상세
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <span className="text-sm text-muted">로딩 중...</span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-line bg-danger-weak p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {alert && !loading && (
          <div className="rounded-card border border-line bg-surface p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-xl font-bold text-balance text-ink">
                {alert.resident?.name ?? "대상자 미상"}
              </h1>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  alert.status === "NEW"
                    ? "bg-danger-weak text-danger"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {ALERT_STATUS_LABELS[alert.status] ?? alert.status}
              </span>
            </div>

            <div className="mb-6">
              {IS_DEMO ? (
                <PoseFrameCard />
              ) : (
                <SnapshotThumb
                  alertId={alert.id}
                  snapshotKey={alert.snapshotKey}
                  className="h-48 w-full"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {alert.resident?.room && (
                <Field label="호실" value={`${alert.resident.room}호`} />
              )}
              <Field
                label="유형"
                value={ALERT_TYPE_LABELS[alert.type] ?? alert.type}
              />
              <Field
                label="신뢰도"
                value={`${Math.round(alert.probability * 100)}%`}
              />
              <Field
                label="감지 시각"
                value={formatTime(alert.detectedAt, { dateStyle: "long", timeStyle: "medium" })}
              />
              {!IS_DEMO && (
                <>
                  <Field
                    label="대상자 ID"
                    value={<span className="font-mono text-xs">{alert.residentId}</span>}
                  />
                  <Field
                    label="alertSeq"
                    value={<span className="font-mono text-xs">{alert.alertSeq}</span>}
                  />
                  {alert.cameraId && (
                    <Field
                      label="카메라 ID"
                      value={<span className="font-mono text-xs">{alert.cameraId}</span>}
                    />
                  )}
                </>
              )}
            </div>

            {alert.status === "NEW" && (
              <div className="mt-6">
                <button
                  onClick={handleAck}
                  disabled={acking}
                  className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {acking ? "처리 중..." : "확인 처리"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
