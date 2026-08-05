import {
  ArchiveX,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  RotateCw,
  Trash2,
  TriangleAlert,
  VideoOff,
  type LucideIcon,
} from "lucide-react";

import { formatDateTime } from "@/lib/format";
import type { AlertMediaPanelState } from "@/services/alertMediaState";

type NonReadyState = Exclude<AlertMediaPanelState, { readonly kind: "READY" }>;

type AlertEvidenceStateProps = {
  readonly state: NonReadyState;
  readonly onRetry: () => void;
};

type StateFrameProps = {
  readonly Icon: LucideIcon;
  readonly children: React.ReactNode;
  readonly role: "alert" | "status";
  readonly tone?: "danger" | "neutral";
};

class UnexpectedEvidenceStateError extends Error {
  readonly name = "UnexpectedEvidenceStateError";
}

export function AlertEvidenceState({ state, onRetry }: AlertEvidenceStateProps) {
  switch (state.kind) {
    case "LOADING":
      return (
        <StateFrame Icon={LoaderCircle} role="status">
          <p>영상 정보를 확인하는 중입니다.</p>
        </StateFrame>
      );
    case "PENDING":
      return (
        <StateFrame Icon={Clock3} role="status">
          <p>근거 영상을 준비하고 있습니다.</p>
          {state.retryAfterSeconds === null ? null : (
            <p className="mt-1 text-sm text-ink-faint">
              약 {state.retryAfterSeconds}초 후 다시 확인해 주세요.
            </p>
          )}
          <RetryButton onRetry={onRetry} />
        </StateFrame>
      );
    case "UNAVAILABLE":
      return (
        <StateFrame Icon={VideoOff} role="status">
          <p>이 알림에 연결된 근거 영상이 없습니다.</p>
        </StateFrame>
      );
    case "FEATURE_DISABLED":
      return (
        <StateFrame Icon={VideoOff} role="status">
          <p>근거 영상 저장이 아직 켜져 있지 않습니다.</p>
          <p className="mt-1 text-sm text-ink-faint">
            이 알림의 녹화가 실패한 것이 아니라, 기능이 꺼져 있는 상태입니다.
          </p>
        </StateFrame>
      );
    case "EXPIRED":
      return (
        <StateFrame Icon={ArchiveX} role="status">
          <p>보관 기간이 만료되어 더 이상 재생할 수 없습니다.</p>
          <p className="mt-1 text-sm text-ink-faint">
            만료 시각 {formatDateTime(state.expiredAt)}
          </p>
        </StateFrame>
      );
    case "DELETED":
      return (
        <StateFrame Icon={Trash2} role="status">
          <p>보관 정책에 따라 삭제되어 더 이상 재생할 수 없습니다.</p>
          <p className="mt-1 text-sm text-ink-faint">
            삭제 시각 {formatDateTime(state.deletedAt)}
          </p>
        </StateFrame>
      );
    case "DENIED":
      return (
        <StateFrame Icon={LockKeyhole} role="alert" tone="danger">
          <p>이 근거 영상을 확인할 권한이 없습니다.</p>
        </StateFrame>
      );
    case "ERROR":
      return (
        <StateFrame Icon={TriangleAlert} role="alert" tone="danger">
          <p>{state.message}</p>
          {state.retryable ? <RetryButton onRetry={onRetry} /> : null}
        </StateFrame>
      );
    default:
      return assertUnexpectedState(state);
  }
}

function StateFrame({ Icon, children, role, tone = "neutral" }: StateFrameProps) {
  const toneClasses = tone === "danger"
    ? "border-status-danger/40 bg-status-dangerBg text-status-danger"
    : "border-border bg-surface2 text-ink-soft";

  return (
    <div
      role={role}
      className={`flex aspect-video min-h-48 w-full flex-col items-center justify-center rounded-xl border px-6 py-8 text-center text-base font-medium break-keep ${toneClasses}`}
    >
      <Icon
        aria-hidden="true"
        className={`mb-3 h-10 w-10 ${Icon === LoaderCircle ? "animate-spin" : ""}`}
      />
      <div>{children}</div>
    </div>
  );
}

function RetryButton({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <RotateCw aria-hidden="true" className="h-4 w-4" />
      다시 확인
    </button>
  );
}

function assertUnexpectedState(state: never): never {
  throw new UnexpectedEvidenceStateError(
    `Unexpected alert evidence state: ${JSON.stringify(state)}`,
  );
}
