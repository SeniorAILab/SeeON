import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import { StaffStatusBadge } from "@/components/staff/StaffStatusBadge";
import { formatDateTime } from "@/lib/format";
import { alertService, type AlertNote } from "@/services/alertService";
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
  const [notesAlert, setNotesAlert] = useState<AlertView | null>(null);
  const [notes, setNotes] = useState<AlertNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const notesRequestId = useRef(0);
  const notesDialogRef = useRef<HTMLDivElement>(null);
  const notesTriggerRef = useRef<HTMLButtonElement | null>(null);
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

  async function resolve(alert: AlertView) {
    await runAction(alert.id, () => alertService.resolve(alert.id));
  }

  function openNotes(alert: AlertView) {
    const requestId = ++notesRequestId.current;
    setNotesAlert(alert);
    setNotes([]);
    setNotesLoading(true);
    setNotesError(null);
    void alertService.listNotes(alert.id)
      .then((loadedNotes) => {
        if (notesRequestId.current === requestId) setNotes(loadedNotes);
      })
      .catch((err) => {
        if (notesRequestId.current === requestId) setNotesError(errorMessage(err));
      })
      .finally(() => {
        if (notesRequestId.current === requestId) setNotesLoading(false);
      });
  }

  const closeNotes = useCallback(() => {
    notesRequestId.current += 1;
    setNotesAlert(null);
    setNotes([]);
    setNotesLoading(false);
    setNotesError(null);
    notesTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!notesAlert) return;
    notesDialogRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeNotes();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeNotes, notesAlert]);

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
  function trapNotesFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = notesDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      notesDialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === notesDialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === notesDialogRef.current)) {
      event.preventDefault();
      first.focus();
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
                onClick={() => resolve(alert)}
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
            renderAction={(alert) => (
              <button
                type="button"
                onClick={(event) => {
                  notesTriggerRef.current = event.currentTarget;
                  void openNotes(alert);
                }}
                className="min-h-[56px] rounded-xl border border-border px-6 text-staff-btn text-ink hover:bg-surface2"
              >
                메모 보기
              </button>
            )}
          />
          {notesAlert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={closeNotes}>
              <div
                ref={notesDialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${notesAlert.room} 메모 히스토리`}
                tabIndex={-1}
                className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-border bg-surface p-5 shadow-modal"
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={trapNotesFocus}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-staff-status text-ink">{notesAlert.room} 메모 히스토리</h2>
                  <button
                    type="button"
                    onClick={closeNotes}
                    className="min-h-12 rounded-xl border border-border px-4 text-staff-btn text-ink hover:bg-surface2"
                  >
                    닫기
                  </button>
                </div>
                {notesLoading ? (
                  <p className="mt-3 text-staff-body text-ink-soft">메모를 불러오는 중입니다.</p>
                ) : notesError ? (
                  <p role="alert" className="mt-3 rounded-xl bg-status-dangerBg p-4 text-staff-body text-status-danger">
                    {notesError}
                  </p>
                ) : notes.length === 0 ? (
                  <p className="mt-3 text-staff-body text-ink-soft">저장된 메모가 없습니다.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {notes.map((note) => (
                      <li key={note.id} className="rounded-xl bg-surface2 px-3 py-2">
                        <div className="text-staff-body font-black text-ink">{note.note}</div>
                        <div className="mt-1 text-base font-bold text-ink-soft">
                          {note.authorRole} · {formatDateTime(note.createdAt)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
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
