"use client";

import { useAlertStream, type SseAlert } from "../lib/sse";
import type { ResidentStatus } from "../lib/sse-utils";
import { StatusBadge } from "./StatusBadge";
import { SnapshotThumb } from "./SnapshotThumb";
import Link from "next/link";

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function AlertCard({ alert }: { alert: SseAlert }) {
  const isNew = alert.status === "NEW";
  return (
    <Link
      href={`/alerts/${alert.id}`}
      className={`flex gap-3 rounded-xl border p-4 transition hover:bg-white/10 ${
        isNew
          ? "border-red-500/30 bg-red-500/5"
          : "border-white/5 bg-white/5"
      }`}
    >
      <SnapshotThumb
        alertId={alert.id}
        snapshotKey={alert.snapshotKey}
        className="h-16 w-16 flex-none"
      />
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white truncate">
            {alert.resident?.name ?? `ID:${alert.residentId.slice(0, 8)}`}
          </span>
          {alert.resident?.room && (
            <span className="text-xs text-slate-400 flex-none">
              {alert.resident.room}호
            </span>
          )}
          <span
            className={`ml-auto flex-none text-xs font-medium ${
              isNew ? "text-red-400" : "text-slate-500"
            }`}
          >
            {alert.status}
          </span>
        </div>
        <p className="text-sm text-slate-300">
          낙상 감지 — 신뢰도{" "}
          <span className="font-semibold text-white">
            {Math.round(alert.probability * 100)}%
          </span>
        </p>
        <p className="text-xs text-slate-500">{formatTime(alert.detectedAt)}</p>
      </div>
    </Link>
  );
}

function StatusGrid({ statuses }: { statuses: ResidentStatus[] }) {
  if (statuses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
        등록된 대상자가 없습니다
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {statuses.map((s) => (
        <div
          key={s.residentId}
          className="rounded-xl border border-white/5 bg-white/5 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-white">
              {s.resident?.name ?? s.residentId.slice(0, 8)}
            </span>
            <StatusBadge state={s.state} />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            {s.resident?.room && <span>{s.resident.room}호</span>}
            <span
              className={`ml-auto h-1.5 w-1.5 rounded-full ${
                s.cameraOnline ? "bg-emerald-400" : "bg-slate-600"
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
      {/* Resident status grid */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold uppercase tracking-widest text-slate-400">
            대상자 현황
          </h2>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className="text-xs text-slate-500">
              {connected ? "SSE 연결됨" : "재연결 중..."}
            </span>
          </div>
        </div>
        <StatusGrid statuses={statuses} />
      </section>

      {/* Live alert feed */}
      <section>
        <h2 className="mb-4 text-base font-semibold uppercase tracking-widest text-slate-400">
          실시간 낙상 피드
        </h2>
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
          {alerts.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
              감지된 낙상 이력이 없습니다
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
