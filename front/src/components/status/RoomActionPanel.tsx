import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { alertService, type AlertNote } from "@/services/alertService";
import { ApiError } from "@/services/apiClient";
import type { DetectionEvent, Space, SpaceStatus } from "@/types";
import { eventTypeLabel } from "@/lib/labels";

interface EventGroup {
  key: string;
  label: string;
  count: number;
  alerts: DetectionEvent[];
}

export function eventGroupsFor(status?: SpaceStatus, alerts: DetectionEvent[] = []): EventGroup[] {
  if (alerts.length > 0) {
    const byType = new Map<string, DetectionEvent[]>();
    for (const alert of alerts) byType.set(alert.eventType, [...(byType.get(alert.eventType) ?? []), alert]);
    return [...byType.entries()].map(([key, events]) => ({
      key,
      label: eventTypeLabel[key],
      count: events.length,
      alerts: events,
    }));
  }
  if (!status) return [];
  const groups: EventGroup[] = [];
  if (status.emergency) groups.push({ key: "emergency", label: "응급", count: 1, alerts: [] });
  if (status.fallRiskLevel === "HIGH" || status.status === "DANGER") groups.push({ key: "fall", label: "낙상 위험", count: 1, alerts: [] });
  if (status.bedsideActivity) groups.push({ key: "bedside", label: "침대 주변 활동", count: 1, alerts: [] });
  if (status.soloMovementAttempt) groups.push({ key: "solo", label: "단독 이동 시도", count: 1, alerts: [] });
  if (status.prolongedInactivity) groups.push({ key: "inactivity", label: "장시간 미움직임", count: 1, alerts: [] });
  if (groups.length === 0 && status.status !== "STABLE") groups.push({ key: "status", label: status.aiSummary || "상태 확인", count: 1, alerts: [] });
  return groups;
}

const statusWord = { STABLE: "안정", CAUTION: "주의", DANGER: "위험", CHECK_NEEDED: "확인 필요" } as const;

export function RoomActionPanel({
  space,
  status,
  alerts = [],
  onClose,
  onResolved,
}: {
  space: Space;
  status?: SpaceStatus;
  alerts?: DetectionEvent[];
  onClose: () => void;
  onResolved?: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => eventGroupsFor(status, alerts), [status, alerts]);
  const canResolve = alerts.length > 0;
  // B4 alert-notes attach to a real Alert id. SpaceStatus.id is a synthetic
  // `status-<spaceId>` key (see alertMerge), never a valid alert id, so notes
  // target the current event's real alert id from `alerts`.
  const targetAlertId = alerts[0]?.id;
  const canWriteNote = Boolean(targetAlertId);
  const [notes, setNotes] = useState<AlertNote[]>([]);
  const [history, setHistory] = useState({ spaceId: space.id, alertId: targetAlertId ?? null });
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const historyAlertId = history.spaceId === space.id ? history.alertId : null;
  const historyIsCurrent = history.spaceId === space.id;
  const visibleNotes = historyIsCurrent ? notes : [];
  const visibleNoteError = historyIsCurrent ? noteError : null;

  useEffect(() => {
    if (history.spaceId !== space.id) {
      setNotes([]);
      setNoteError(null);
      setNotesLoading(false);
      setHistory({ spaceId: space.id, alertId: targetAlertId ?? null });
    }
  }, [history.spaceId, space.id, targetAlertId]);

  useEffect(() => {
    let ignore = false;
    if (!historyAlertId) {
      setNotesLoading(false);
      return;
    }
    setNotes([]);
    setNotesLoading(true);
    setNoteError(null);
    void alertService.listNotes(historyAlertId)
      .then((loadedNotes) => {
        if (!ignore) setNotes(loadedNotes);
      })
      .catch(() => {
        if (!ignore) setNoteError("메모를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
      })
      .finally(() => {
        if (!ignore) setNotesLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [historyAlertId]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);


  async function handleResolve(alertIds?: string[]) {
    const ids = alertIds ?? alerts.map((alert) => alert.id);
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => alertService.resolve(id)));
      onResolved?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNote() {
    const trimmed = note.trim();
    if (!targetAlertId || !canWriteNote || !trimmed || noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      await alertService.createNote(targetAlertId, trimmed);
      if (targetAlertId === historyAlertId) {
        setNotes(await alertService.listNotes(targetAlertId));
      }
      setNote("");
    } catch (error) {
      setNoteError(
        error instanceof ApiError && error.status === 403
          ? "이 계정에는 메모 작성 권한이 없습니다. 관리자 또는 요양보호사 계정으로 로그인해주세요."
          : "메모 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={space.name}
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-border bg-surface p-4 shadow-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-keep text-2xl font-black leading-tight text-ink 2xl:text-3xl">{space.name}</div>
          <div className="mt-1 text-lg font-bold text-ink-soft">{statusWord[status?.status ?? "STABLE"]}</div>
        </div>
        <button type="button" onClick={onClose} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border text-ink-soft hover:bg-surface2" aria-label="모달 닫기">
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        {groups.length === 0 ? (
          <div className="rounded-2xl bg-surface2 px-4 py-3 text-staff-body font-bold text-ink-soft">현재 조치가 필요한 이벤트가 없습니다.</div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="rounded-2xl border border-border bg-bg px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-staff-body font-black text-ink">{group.label}</div>
                  <div className="mt-1 text-staff-body font-bold text-ink-soft">{group.count}건</div>
                </div>
                {group.alerts.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => void handleResolve(group.alerts.map((alert) => alert.id))} className="min-h-12 rounded-xl bg-brand px-3 py-2 text-staff-btn text-white disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-ink-faint">
                    그룹 확인
                  </button>
                )}
              </div>
              {group.alerts.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {group.alerts.map((alert) => (
                    <li key={alert.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface2 px-3 py-2">
                      <span className="min-w-0 truncate text-sm font-bold text-ink-soft">{alert.aiSummary || alert.message}</span>
                      <button type="button" disabled={busy} onClick={() => void handleResolve([alert.id])} className="min-h-12 shrink-0 rounded-lg border border-border px-2 py-1 text-staff-btn text-ink disabled:cursor-not-allowed disabled:text-ink-faint">
                        개별 확인
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      <label className="mt-4 block text-staff-body font-black text-ink" htmlFor={`note-${space.id}`}>메모</label>
      {!canWriteNote && <div className="mt-2 rounded-2xl bg-surface2 px-4 py-3 text-staff-body font-bold text-ink-soft">현재 기록할 이벤트가 없습니다.</div>}
      <textarea
        id={`note-${space.id}`}
        value={note}
        disabled={!canWriteNote || noteSaving || notesLoading}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2 min-h-24 w-full rounded-2xl border border-border bg-bg p-3 text-staff-body text-ink outline-none focus:border-brand disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-ink-soft"
        placeholder={canWriteNote ? "조치 내용을 입력하세요" : "현재 기록할 이벤트가 없습니다"}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!canWriteNote || note.trim().length === 0 || noteSaving || notesLoading} onClick={() => void handleSaveNote()} className="h-14 rounded-2xl border border-border px-5 text-staff-btn text-ink hover:bg-surface2 disabled:cursor-not-allowed disabled:text-ink-faint">
          {noteSaving ? "저장 중" : "메모 저장"}
        </button>
        <button type="button" disabled={!canResolve || busy} onClick={() => void handleResolve()} className="h-14 rounded-2xl bg-brand px-5 text-staff-btn text-white shadow-card disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-ink-faint">
          {busy ? "처리 중" : "확인완료"}
        </button>
      </div>
      {visibleNoteError && (
        <div role="alert" className="mt-2 rounded-2xl bg-status-dangerBg px-4 py-3 text-staff-body font-bold text-status-danger">
          {visibleNoteError}
        </div>
      )}
      <div className="mt-4 rounded-2xl bg-bg px-4 py-3">
        <div className="text-staff-body font-black text-ink">메모 히스토리</div>
        {notesLoading && historyIsCurrent ? (
          <div className="mt-2 text-staff-body font-bold text-ink-soft">메모를 불러오는 중입니다.</div>
        ) : visibleNotes.length === 0 ? (
          <div className="mt-2 text-staff-body font-bold text-ink-soft">저장된 메모가 없습니다.</div>
        ) : (
          <ul className="mt-3 space-y-2">
            {visibleNotes.map((item) => (
              <li key={item.id} className="rounded-xl bg-surface2 px-3 py-2">
                <div className="text-staff-body font-black text-ink">{item.note}</div>
                <div className="mt-1 text-base font-bold text-ink-soft">
                  {item.authorRole} · {new Date(item.createdAt).toLocaleString("ko-KR")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}
