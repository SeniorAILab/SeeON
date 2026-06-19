"use client";

import { use, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import type { AlertStatus, SseAlert } from "../../../lib/sse-utils";
import { ALERT_STATUS_LABELS, ALERT_TYPE_LABELS, formatTime } from "../../../lib/sse-utils";
import { EmptyState } from "../../../components/EmptyState";

const PAGE_SIZE = 50;

// ponytail: type removed from path — backend has no ?type filter; filtering is client-side only
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

function typeChipCls(type: string): string {
  if (type === "FALL") return "bg-danger-weak text-danger";
  if (type === "BED_EXIT") return "bg-warn-weak text-warn";
  return "bg-brand-weak text-brand-ink";
}

function statusChipCls(status: AlertStatus): string {
  if (status === "NEW") return "bg-danger-weak text-danger";
  if (status === "ACKED") return "bg-warn-weak text-warn";
  return "bg-ok-weak text-ok";
}

const STATUS_TABS: { value: AlertStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "NEW", label: "미확인" },
  { value: "ACKED", label: "확인됨" },
  { value: "RESOLVED", label: "해결됨" },
];

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "전체 유형" },
  { value: "FALL", label: "낙상" },
  { value: "BED_EXIT", label: "침대 이탈" },
  { value: "NO_MOTION", label: "움직임 없음" },
  { value: "DETECTION_LOST", label: "감지 끊김" },
];

export default function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string; status?: string }>;
}) {
  const { residentId: initialResidentId, status: initialStatus } = use(searchParams);

  const [alerts, setAlerts] = useState<SseAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status filter: server-side (backend supports ?status)
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "">(
    initialStatus === "NEW" || initialStatus === "ACKED" || initialStatus === "RESOLVED"
      ? initialStatus
      : "",
  );

  // Type filter: client-side only — backend has no ?type param
  const [typeFilter, setTypeFilter] = useState("");

  // Resident ID search: applied on submit
  const [residentInput, setResidentInput] = useState(initialResidentId ?? "");
  const [appliedResidentId, setAppliedResidentId] = useState(initialResidentId ?? "");

  useEffect(() => {
    let cancelled = false;
    // ponytail: reset-before-refetch when filters change; intentional sync set.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    api
      .get<SseAlert[]>(buildAlertsPath({ residentId: appliedResidentId, status: statusFilter }))
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
  }, [appliedResidentId, statusFilter]);

  // ponytail: client-side type filter applied over the fetched page
  const displayed = useMemo(
    () => (typeFilter ? alerts.filter((a) => a.type === typeFilter) : alerts),
    [alerts, typeFilter],
  );

  function handleStatusTab(s: AlertStatus | "") {
    setAlerts([]);
    setHasMore(false);
    setStatusFilter(s);
  }

  function handleResidentSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAlerts([]);
    setHasMore(false);
    setAppliedResidentId(residentInput.trim());
  }

  function handleResidentReset() {
    setResidentInput("");
    setAlerts([]);
    setHasMore(false);
    setAppliedResidentId("");
  }

  async function loadOlder() {
    const beforeSeq = alerts.at(-1)?.alertSeq;
    if (!beforeSeq) return;
    setLoadingMore(true);
    setError(null);
    try {
      const older = await api.get<SseAlert[]>(
        buildAlertsPath({ residentId: appliedResidentId, status: statusFilter, beforeSeq }),
      );
      setAlerts((current) => [...current, ...older]);
      setHasMore(older.length === PAGE_SIZE);
    } catch (err: Error | unknown) {
      setError(err instanceof Error ? err.message : "이전 알림을 불러오지 못했습니다");
    } finally {
      setLoadingMore(false);
    }
  }

  const hasAnyFilter = Boolean(appliedResidentId || statusFilter || typeFilter);

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand">알림 이력</p>
            <h1 className="mt-1 text-2xl font-bold text-balance text-ink">알림</h1>
          </div>
          <Link href="/dashboard" className="text-sm text-ink-2 transition hover:text-ink">
            ← 대시보드
          </Link>
        </div>

        {/* Status filter tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleStatusTab(tab.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                statusFilter === tab.value
                  ? "bg-brand text-white shadow-sm"
                  : "border border-line bg-surface text-ink-2 hover:bg-canvas"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Type filter chips — client-side only */}
        <div className="mb-5 flex flex-wrap gap-2">
          {TYPE_FILTERS.map((chip) => {
            const active = typeFilter === chip.value;
            const activeCls =
              chip.value === "FALL"
                ? "bg-danger text-white"
                : chip.value === "BED_EXIT"
                  ? "bg-warn text-white"
                  : "bg-brand text-white";
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setTypeFilter(chip.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? activeCls
                    : "border border-line bg-surface text-ink-2 hover:bg-canvas"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Resident ID search */}
        <form onSubmit={handleResidentSearch} className="mb-6 flex flex-wrap gap-3">
          <input
            name="residentId"
            value={residentInput}
            onChange={(e) => setResidentInput(e.target.value)}
            placeholder="대상자 ID로 검색"
            className="min-w-56 flex-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm text-ink placeholder-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand-weak"
          />
          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-ink"
          >
            검색
          </button>
          {appliedResidentId && (
            <button
              type="button"
              onClick={handleResidentReset}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
            >
              초기화
            </button>
          )}
        </form>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <span className="text-sm text-muted">로딩 중...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-line bg-danger-weak p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Alert cards */}
        {!loading && !error && (
          <div className="flex flex-col gap-3">
            {displayed.map((alert) => (
              <Link
                key={alert.id}
                href={`/alerts/${alert.id}`}
                className="group rounded-card border border-line bg-surface p-5 shadow-sm transition hover:bg-surface-2 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: type chip + name/room + time/probability */}
                  <div className="min-w-0 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${typeChipCls(alert.type)}`}
                      >
                        {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                      </span>
                      <span className="font-semibold text-ink truncate">
                        {alert.resident?.name ?? `ID:${alert.residentId.slice(0, 8)}`}
                      </span>
                      {alert.resident?.room && (
                        <span className="text-xs text-muted">{alert.resident.room}호</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span className="tabular-nums">{formatTime(alert.detectedAt)}</span>
                      <span>신뢰도 {Math.round(alert.probability * 100)}%</span>
                    </div>
                  </div>
                  {/* Right: status chip + chevron */}
                  <div className="flex flex-none items-center gap-3 pt-0.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChipCls(alert.status)}`}
                    >
                      {ALERT_STATUS_LABELS[alert.status] ?? alert.status}
                    </span>
                    <span className="text-muted transition group-hover:text-ink">›</span>
                  </div>
                </div>
              </Link>
            ))}

            {displayed.length === 0 && (
              <EmptyState
                message={hasAnyFilter ? "조건에 맞는 알림이 없습니다" : "알림 이력이 없습니다"}
              />
            )}

            {hasMore && (
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingMore}
                className="mt-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-60"
              >
                {loadingMore ? "불러오는 중..." : "이전 알림 더 보기"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
