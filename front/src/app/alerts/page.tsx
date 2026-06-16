"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import type { AlertStatus, SseAlert } from "../../lib/sse-utils";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<string, string> = {
  NEW: "신규",
  ACKED: "확인됨",
  RESOLVED: "해결됨",
};

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildAlertsPath(filters: {
  residentId: string;
  status: AlertStatus | "";
  beforeSeq?: string;
}): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.residentId) params.set("residentId", filters.residentId);
  if (filters.status) params.set("status", filters.status);
  if (filters.beforeSeq) params.set("beforeSeq", filters.beforeSeq);
  return `/api/alerts?${params.toString()}`;
}

export default function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string; status?: string }>;
}) {
  const { residentId: initialResidentId, status: initialStatus } =
    use(searchParams);

  const [alerts, setAlerts] = useState<SseAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterInput, setFilterInput] = useState(initialResidentId ?? "");
  const [statusInput, setStatusInput] = useState<AlertStatus | "">(
    initialStatus === "NEW" ||
      initialStatus === "ACKED" ||
      initialStatus === "RESOLVED"
      ? initialStatus
      : "",
  );
  const [appliedFilters, setAppliedFilters] = useState({
    residentId: initialResidentId ?? "",
    status: statusInput,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get<SseAlert[]>(buildAlertsPath(appliedFilters))
      .then((data) => {
        if (cancelled) return;
        setAlerts(data);
        setHasMore(data.length === PAGE_SIZE);
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
  }, [appliedFilters]);

  function handleFilter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAlerts([]);
    setHasMore(false);
    setAppliedFilters({
      residentId: filterInput.trim(),
      status: statusInput,
    });
  }

  function handleReset() {
    setFilterInput("");
    setStatusInput("");
    setLoading(true);
    setError(null);
    setAlerts([]);
    setHasMore(false);
    setAppliedFilters({ residentId: "", status: "" });
  }

  async function loadOlder() {
    const beforeSeq = alerts.at(-1)?.alertSeq;
    if (!beforeSeq) return;
    setLoadingMore(true);
    setError(null);
    try {
      const older = await api.get<SseAlert[]>(
        buildAlertsPath({ ...appliedFilters, beforeSeq }),
      );
      setAlerts((current) => [...current, ...older]);
      setHasMore(older.length === PAGE_SIZE);
    } catch (err: Error | unknown) {
      setError(err instanceof Error ? err.message : "이전 알림을 불러오지 못했습니다");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtering = Boolean(appliedFilters.residentId || appliedFilters.status);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Alert History
            </p>
            <h1 className="mt-1 text-2xl font-bold">알림 이력</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← 대시보드
          </Link>
        </div>

        <form onSubmit={handleFilter} className="mb-6 flex flex-wrap gap-3">
          <input
            name="residentId"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            placeholder="대상자 ID로 필터"
            className="min-w-64 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
          />
          <select
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value as AlertStatus | "")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none focus:border-cyan-500"
          >
            <option value="">전체 상태</option>
            <option value="NEW">신규</option>
            <option value="ACKED">확인됨</option>
            <option value="RESOLVED">해결됨</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-cyan-700 px-5 py-2 text-sm font-semibold transition hover:bg-cyan-600"
          >
            검색
          </button>
          {filtering && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-white/10 px-5 py-2 text-sm text-slate-400 transition hover:text-white"
            >
              초기화
            </button>
          )}
        </form>

        {loading && (
          <div className="flex justify-center py-16">
            <span className="text-sm text-slate-500">로딩 중...</span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <Link
                key={alert.id}
                href={`/alerts/${alert.id}`}
                className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 p-4 transition hover:bg-white/10"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">
                      {alert.resident?.name ??
                        `ID:${alert.residentId.slice(0, 8)}`}
                    </span>
                    {alert.resident?.room && (
                      <span className="flex-none text-xs text-slate-400">
                        {alert.resident.room}호
                      </span>
                    )}
                    <span
                      className={`ml-auto flex-none rounded-full px-2 py-0.5 text-xs font-semibold ${
                        alert.status === "NEW"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {STATUS_LABELS[alert.status] ?? alert.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    낙상 감지 — 신뢰도 {Math.round(alert.probability * 100)}%
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatTime(alert.detectedAt)} · alertSeq {alert.alertSeq}
                  </p>
                </div>
                <span className="flex-none text-slate-600">›</span>
              </Link>
            ))}
            {alerts.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">
                {filtering ? "조건에 맞는 알림 이력이 없습니다" : "알림 이력이 없습니다"}
              </div>
            )}
            {alerts.length > 0 && hasMore && (
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingMore}
                className="mt-4 rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:text-white disabled:opacity-60"
              >
                {loadingMore ? "불러오는 중..." : "이전 알림 더 보기"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
