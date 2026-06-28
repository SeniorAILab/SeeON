import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import { StaffStatusBadge } from "@/components/staff/StaffStatusBadge";
import { formatDateTime } from "@/lib/format";
import { alertService } from "@/services/alertService";
import type { AlertStatus, AlertView, SpaceStatusLevel } from "@/types";

const typeLabels: Record<string, string> = {
  fall: "낙상 감지",
  "bed-exit": "침대 이탈",
  "detection-lost": "감지 끊김",
};

const statusBadge: Record<AlertStatus, SpaceStatusLevel> = {
  NEW: "CHECK_NEEDED",
  ACKED: "CAUTION",
  RESOLVED: "STABLE",
};

export function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAlerts(await alertService.listRecent(200));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () => ({
      NEW: alerts.filter((alert) => alert.status === "NEW"),
      ACKED: alerts.filter((alert) => alert.status === "ACKED"),
      RESOLVED: alerts.filter((alert) => alert.status === "RESOLVED"),
    }),
    [alerts]
  );

  async function acknowledge(alert: AlertView) {
    await runAction(alert.id, () => alertService.acknowledge(alert.id));
  }

  async function resolve(alert: AlertView) {
    await runAction(alert.id, () => alertService.resolve(alert.id));
  }

  async function runAction(id: string, action: () => Promise<AlertView>) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-staff-name text-ink">알림 처리</h1>

      {error && (
        <p className="rounded-xl bg-status-dangerBg p-4 text-staff-body text-status-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-staff-body text-ink-soft">불러오는 중입니다...</p>
      ) : (
        <div className="space-y-6">
          <AlertSection
            title="확인 필요"
            empty="확인할 새 알림이 없습니다."
            alerts={grouped.NEW}
            renderMeta={(alert) => `${typeLabel(alert.type)} · ${formatDateTime(alert.detectedAt)}`}
            renderAction={(alert) => (
              <button
                disabled={busyId !== null}
                onClick={() => acknowledge(alert)}
                className="min-h-[56px] rounded-xl bg-brand px-6 text-staff-btn text-white disabled:opacity-60"
              >
                확인
              </button>
            )}
          />

          <AlertSection
            title="확인됨"
            empty="확인된 알림이 없습니다."
            alerts={grouped.ACKED}
            renderMeta={(alert) =>
              `${alert.ackedByName ?? "직원"} 확인 · ${formatDateTime(alert.ackedAt ?? alert.detectedAt)}`
            }
            renderAction={(alert) => (
              <button
                disabled={busyId !== null}
                onClick={() => resolve(alert)}
                className="min-h-[56px] rounded-xl bg-status-stable px-6 text-staff-btn text-white disabled:opacity-60"
              >
                해결 완료
              </button>
            )}
          />

          <AlertSection
            title="해결됨"
            empty="해결된 알림이 없습니다."
            alerts={grouped.RESOLVED}
            renderMeta={(alert) =>
              `${alert.resolvedByName ?? "직원"} 해결 · ${formatDateTime(
                alert.resolvedAt ?? alert.detectedAt
              )}`
            }
          />
        </div>
      )}
    </div>
  );
}

function AlertSection({
  title,
  empty,
  alerts,
  renderMeta,
  renderAction,
}: {
  title: string;
  empty: string;
  alerts: AlertView[];
  renderMeta: (alert: AlertView) => string;
  renderAction?: (alert: AlertView) => ReactNode;
}) {
  return (
    <section className="space-y-3" aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`} className="text-staff-status text-ink">
        {title}
      </h2>
      {alerts.length === 0 ? (
        <div className="rounded-2xl border-2 border-border bg-surface px-6 py-10 text-center">
          <CheckCheck className="mx-auto mb-3 h-12 w-12 text-ink-faint" />
          <p className="text-staff-body text-ink-soft">{empty}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-2xl border-2 border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-staff-status text-ink">{alert.room}</span>
                    <StaffStatusBadge status={statusBadge[alert.status]} />
                  </div>
                  <p className="mt-2 text-staff-body text-ink-soft">{renderMeta(alert)}</p>
                </div>
                {renderAction?.(alert)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function typeLabel(type: string): string {
  return typeLabels[type] ?? type;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "알림을 처리하지 못했습니다.";
}
