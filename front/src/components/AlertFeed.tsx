"use client";

import { useAlertStream, type SseAlert } from "../lib/sse";
import type { ResidentStatus } from "../lib/sse-utils";
import { formatTime, ALERT_TYPE_LABELS } from "../lib/sse-utils";
import { IS_DEMO } from "../lib/config";
import { StatusBadge } from "./StatusBadge";
import { SnapshotThumb } from "./SnapshotThumb";
import { EmptyState } from "./EmptyState";
import Link from "next/link";

// Demo evidence thumbnail: pose-based type marker, no stored image and no
// /api/alerts/*/snapshot dependency (privacy-first; AC-E).
function AlertTypeThumb({ type }: { type: string }) {
  const cls =
    type === "FALL"
      ? "bg-danger-weak text-danger"
      : type === "BED_EXIT"
        ? "bg-warn-weak text-warn"
        : "bg-brand-weak text-brand-ink";
  return (
    <div
      className={`flex h-16 w-16 flex-none items-center justify-center rounded-lg text-center text-xs font-bold leading-tight ${cls}`}
    >
      {ALERT_TYPE_LABELS[type] ?? "감지"}
    </div>
  );
}

function AlertCard({ alert }: { alert: SseAlert }) {
  const isNew = alert.status === "NEW";
  const typeLabel = ALERT_TYPE_LABELS[alert.type] ?? "이상";
  return (
    <Link
      href={`/alerts/${alert.id}`}
      className={`flex gap-3 rounded-xl border p-4 shadow-sm transition hover:border-brand/40 ${
        isNew ? "border-danger/30 bg-danger-weak" : "border-line bg-surface"
      }`}
    >
      {IS_DEMO ? (
        <AlertTypeThumb type={alert.type} />
      ) : (
        <SnapshotThumb
          alertId={alert.id}
          snapshotKey={alert.snapshotKey}
          className="h-16 w-16 flex-none"
        />
      )}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink truncate">
            {alert.resident?.name ?? `ID:${alert.residentId.slice(0, 8)}`}
          </span>
          {alert.resident?.room && (
            <span className="text-xs text-muted flex-none">
              {alert.resident.room}호
            </span>
          )}
          <span
            className={`ml-auto flex-none text-xs font-semibold ${
              isNew ? "text-danger" : "text-muted"
            }`}
          >
            {alert.status}
          </span>
        </div>
        <p className="text-sm text-ink-2">
          {typeLabel} 감지 — 신뢰도{" "}
          <span className="font-semibold text-ink tabular-nums">

            {Math.round(alert.probability * 100)}%
          </span>
        </p>
        <p className="text-xs text-muted tabular-nums">
          {formatTime(alert.detectedAt, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        </p>
      </div>
    </Link>
  );
}

function StatusGrid({ statuses }: { statuses: ResidentStatus[] }) {
  if (statuses.length === 0) {
    return <EmptyState message="등록된 대상자가 없습니다" className="p-6" />;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {statuses.map((s) => (
        <div
          key={s.residentId}
          className="rounded-xl border border-line bg-surface p-3 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">
              {s.resident?.name ?? s.residentId.slice(0, 8)}
            </span>
            <StatusBadge state={s.state} />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            {s.resident?.room && <span>{s.resident.room}호</span>}
            <span
              className={`ml-auto h-1.5 w-1.5 rounded-full ${
                s.cameraOnline ? "bg-ok" : "bg-muted"
              }`}
              title={s.cameraOnline ? "카메라 온라인" : "카메라 오프라인"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface AlertFeedProps {
  initialAlerts: SseAlert[];
  initialStatuses: ResidentStatus[];
}

export function AlertFeed({ initialAlerts, initialStatuses }: AlertFeedProps) {
  const { alerts, statuses, connected } = useAlertStream({
    initialAlerts,
    initialStatuses,
    maxAlerts: 50,
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-ink">
            대상자 현황
          </h2>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-ok" : "bg-warn animate-pulse"
              }`}
            />
            <span className="text-xs text-muted">
              {connected ? "실시간 연결됨" : "연결 중..."}
            </span>
          </div>
        </div>
        <StatusGrid statuses={statuses} />
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-ink">
          실시간 낙상 피드
        </h2>
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
          {alerts.length === 0 && (
            <EmptyState message="감지된 낙상 이력이 없습니다" className="p-8" />
          )}
        </div>
      </section>
    </div>
  );
}
