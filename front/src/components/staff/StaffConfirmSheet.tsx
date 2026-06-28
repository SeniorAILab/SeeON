import { useEffect, useState } from "react";
import { X, Check, Footprints, Hand, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaffStatusBadge } from "./StaffStatusBadge";
import { peoplePhrase, plainDescription } from "@/lib/staffCopy";
import { alertService } from "@/services/alertService";
import { useAuthStore, canAcknowledge } from "@/store/authStore";
import type { ActionType, AlertView, Floor, Space, SpaceStatus } from "@/types";

// 직원용 조치는 큰 버튼 3개만. 추가 기록은 접어둔다.
const PRIMARY: { type: ActionType; label: string; Icon: typeof Check; tone: string }[] = [
  { type: "ACKNOWLEDGED", label: "확인 완료", Icon: Check, tone: "bg-status-stable" },
  { type: "STAFF_VISIT", label: "직원 방문 중", Icon: Footprints, tone: "bg-brand" },
  { type: "HELP_REQUEST", label: "도움 요청", Icon: Hand, tone: "bg-status-danger" },
];

export function StaffConfirmSheet({
  space,
  floor,
  status,
  onClose,
  onDone,
}: {
  space: Space;
  floor?: Floor;
  status?: SpaceStatus;
  onClose: () => void;
  onDone: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const allowed = canAcknowledge(user);
  const [openAlert, setOpenAlert] = useState<AlertView | null>(null);
  const [ackedAlert, setAckedAlert] = useState<AlertView | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingAlert, setLoadingAlert] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMemo, setShowMemo] = useState(false);
  const [memo, setMemo] = useState("");

  useEffect(() => {
    let alive = true;
    setLoadingAlert(true);
    setError(null);
    alertService
      .openAlertForSpace(space.id)
      .then(async (open) => {
        const acked = open ? null : await alertService.ackedAlertForSpace(space.id);
        if (!alive) return;
        setOpenAlert(open);
        setAckedAlert(acked);
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err));
      })
      .finally(() => {
        if (alive) setLoadingAlert(false);
      });
    return () => {
      alive = false;
    };
  }, [space.id]);

  async function acknowledge(label: string) {
    if (!allowed || busy || !openAlert) return;
    setBusy(true);
    setError(null);
    try {
      // TODO(action-log): memo persistence deferred until the backend action-log field exists.
      void memo;
      await alertService.acknowledge(openAlert.id);
      setDone(label);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!allowed || busy || !ackedAlert) return;
    setBusy(true);
    setError(null);
    try {
      // TODO(action-log): memo persistence deferred until the backend action-log field exists.
      void memo;
      await alertService.resolve(ackedAlert.id);
      setDone("해결 완료");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const level = status?.status ?? "CHECK_NEEDED";
  const noOpenAlert = !loadingAlert && !openAlert;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-t-3xl bg-surface p-6 shadow-panel sm:rounded-3xl">
        {/* 헤더 */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-staff-name text-ink">{space.name}</h2>
              {floor && <span className="text-staff-body text-ink-faint">{floor.name}</span>}
            </div>
            <p className="mt-1 text-staff-body text-ink-soft">
              {peoplePhrase(status?.peopleCount ?? 0)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-faint hover:bg-surface2"
            aria-label="닫기"
          >
            <X className="h-7 w-7" />
          </button>
        </div>

        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-status-stableBg">
              <Check className="h-9 w-9 text-status-stable" />
            </div>
            <p className="text-staff-status text-ink">{done} 처리했습니다.</p>
            <button
              onClick={onClose}
              className="mt-6 min-h-[56px] w-full rounded-xl bg-brand text-staff-btn text-white"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            {/* 상태 + 설명 */}
            <div className="mb-5 rounded-2xl bg-surface2 p-4">
              <StaffStatusBadge status={level} size="lg" />
              <p className="mt-3 text-staff-body text-ink">
                {status ? plainDescription(status) : ""}
              </p>
            </div>

            {error && (
              <p className="mb-4 rounded-xl bg-status-dangerBg p-4 text-staff-body text-status-danger">
                {error}
              </p>
            )}

            {!allowed ? (
              <p className="rounded-xl bg-surface2 p-4 text-staff-body text-ink-soft">
                조치 기록은 케어 직원 권한에서 할 수 있습니다.
              </p>
            ) : (
              <>
                <p className="mb-3 text-staff-body font-bold text-ink-soft">
                  어떻게 하셨나요?
                </p>
                {loadingAlert ? (
                  <p className="rounded-xl bg-surface2 p-4 text-staff-body text-ink-soft">
                    알림 상태를 확인하는 중입니다...
                  </p>
                ) : (
                  <>
                    {noOpenAlert && (
                      <p className="mb-3 rounded-xl bg-surface2 p-4 text-staff-body text-ink-soft">
                        {ackedAlert
                          ? "새 알림은 없습니다. 확인된 알림은 해결 완료로 처리할 수 있습니다."
                          : "이 공간에 확인할 새 알림이 없습니다."}
                      </p>
                    )}
                    <div className="space-y-3">
                      {PRIMARY.map(({ type, label, Icon, tone }) => (
                        <button
                          key={type}
                          disabled={busy || !openAlert}
                          onClick={() => acknowledge(label)}
                          className={cn(
                            "flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-6 text-staff-btn text-white transition-transform active:scale-[0.98] disabled:opacity-60",
                            tone
                          )}
                        >
                          <Icon className="h-7 w-7 shrink-0" />
                          {label}
                        </button>
                      ))}
                      {ackedAlert && (
                        <button
                          disabled={busy}
                          onClick={resolve}
                          className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl bg-status-stable px-6 text-staff-btn text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                        >
                          <Check className="h-7 w-7 shrink-0" />
                          해결 완료
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* 추가 기록은 접어둔다 */}
                <button
                  onClick={() => setShowMemo((v) => !v)}
                  className="mt-4 flex items-center gap-1 text-staff-body text-ink-faint"
                >
                  <ChevronDown
                    className={cn("h-5 w-5 transition-transform", showMemo && "rotate-180")}
                  />
                  메모 남기기 (선택)
                </button>
                {showMemo && (
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={2}
                    placeholder="필요하면 적어주세요."
                    className="mt-2 w-full rounded-xl border-2 border-border bg-surface p-3 text-staff-body text-ink focus:border-brand focus:outline-none"
                  />
                )}

                {/* 영상은 직원 화면에 노출하지 않는다 */}
                <p className="mt-4 text-center text-sm text-ink-faint">
                  영상은 관리자만 확인할 수 있습니다.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "알림을 처리하지 못했습니다.";
}
