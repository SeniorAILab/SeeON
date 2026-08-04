import { ApiError } from "@/services/apiClient";
import {
  AlertMediaResponseError,
  type AlertMediaMetadata,
  type ReadyAlertMediaClip,
} from "./api/alertMedia";

/**
 * 백엔드가 "근거 영상 기능이 꺼져 있음"을 알릴 때 쓰는 코드.
 * `backend/src/media/alert-media.service.ts`의 상수와 같은 값이어야 한다.
 */
export const MEDIA_FEATURE_DISABLED_CODE = "MEDIA_FEATURE_DISABLED";

export type AlertMediaPanelState =
  | { readonly kind: "LOADING"; readonly requestKey: string }
  | {
      readonly kind: "PENDING";
      readonly requestKey: string;
      readonly retryAfterSeconds: number | null;
    }
  | {
      readonly kind: "READY";
      readonly requestKey: string;
      readonly clip: ReadyAlertMediaClip;
    }
  | { readonly kind: "UNAVAILABLE"; readonly requestKey: string }
  /**
   * 근거 영상 기능 자체가 꺼져 있음. UNAVAILABLE("이 알림에 클립이 없음")과
   * 반드시 구분해야 한다 — 섞으면 화면이 지어낸 상태를 말하게 된다.
   */
  | { readonly kind: "FEATURE_DISABLED"; readonly requestKey: string }
  | {
      readonly kind: "EXPIRED";
      readonly requestKey: string;
      readonly expiredAt: string;
    }
  | {
      readonly kind: "DELETED";
      readonly requestKey: string;
      readonly deletedAt: string;
    }
  | {
      readonly kind: "DENIED";
      readonly requestKey: string;
      readonly status: 401 | 403;
    }
  | {
      readonly kind: "ERROR";
      readonly requestKey: string;
      readonly retryable: boolean;
      readonly message: string;
    };

export type AlertMediaRequestIdentity = {
  readonly facilityId: string;
  readonly alertId: string;
  readonly userId: string;
};

export type AlertMediaStateAction =
  | { readonly type: "REQUEST_STARTED"; readonly requestKey: string }
  | {
      readonly type: "METADATA_LOADED";
      readonly requestKey: string;
      readonly metadata: AlertMediaMetadata;
    }
  | {
      readonly type: "REQUEST_FAILED";
      readonly requestKey: string;
      readonly error: unknown;
    };

type LoadAlertMediaMetadata = (
  alertId: string,
  signal: AbortSignal,
) => Promise<AlertMediaMetadata>;

type AlertMediaStateListener = (state: AlertMediaPanelState) => void;

export type AlertMediaCoordinator = {
  readonly load: (
    identity: AlertMediaRequestIdentity,
    onState: AlertMediaStateListener,
  ) => Promise<void>;
  readonly cancel: () => void;
};

type ActiveRequest = {
  readonly generation: number;
  readonly requestKey: string;
  readonly controller: AbortController;
};

class UnexpectedAlertMediaActionError extends Error {
  readonly name = "UnexpectedAlertMediaActionError";
}

export function createAlertMediaRequestKey(
  identity: AlertMediaRequestIdentity,
): string {
  return `${identity.facilityId}:${identity.alertId}:${identity.userId}`;
}

export function reduceAlertMediaState(
  state: AlertMediaPanelState,
  action: AlertMediaStateAction,
): AlertMediaPanelState {
  switch (action.type) {
    case "REQUEST_STARTED":
      return { kind: "LOADING", requestKey: action.requestKey };
    case "METADATA_LOADED":
      if (action.requestKey !== state.requestKey) return state;
      return metadataState(action.requestKey, action.metadata);
    case "REQUEST_FAILED":
      if (action.requestKey !== state.requestKey) return state;
      return failureState(action.requestKey, action.error);
    default:
      return assertUnexpectedAction(action);
  }
}

export function createAlertMediaCoordinator(
  loadMetadata: LoadAlertMediaMetadata,
): AlertMediaCoordinator {
  let generation = 0;
  let activeRequest: ActiveRequest | null = null;

  return {
    async load(identity, onState): Promise<void> {
      activeRequest?.controller.abort();
      generation += 1;
      const requestKey = createAlertMediaRequestKey(identity);
      const controller = new AbortController();
      const requestGeneration = generation;
      activeRequest = { generation: requestGeneration, requestKey, controller };
      const loading = reduceAlertMediaState(
        { kind: "LOADING", requestKey },
        { type: "REQUEST_STARTED", requestKey },
      );
      onState(loading);

      try {
        const metadata = await loadMetadata(identity.alertId, controller.signal);
        if (!isActive(activeRequest, requestGeneration, requestKey)) return;
        onState(reduceAlertMediaState(loading, {
          type: "METADATA_LOADED",
          requestKey,
          metadata,
        }));
      } catch (error) {
        if (
          controller.signal.aborted ||
          !isActive(activeRequest, requestGeneration, requestKey)
        ) {
          return;
        }
        onState(reduceAlertMediaState(loading, {
          type: "REQUEST_FAILED",
          requestKey,
          error,
        }));
      } finally {
        if (isActive(activeRequest, requestGeneration, requestKey)) {
          activeRequest = null;
        }
      }
    },
    cancel(): void {
      activeRequest?.controller.abort();
      generation += 1;
      activeRequest = null;
    },
  };
}

function metadataState(
  requestKey: string,
  metadata: AlertMediaMetadata,
): AlertMediaPanelState {
  switch (metadata.status) {
    case "PENDING":
      return {
        kind: "PENDING",
        requestKey,
        retryAfterSeconds: metadata.retryAfterSeconds,
      };
    case "READY":
      return { kind: "READY", requestKey, clip: metadata.clip };
    case "UNAVAILABLE":
      return { kind: "UNAVAILABLE", requestKey };
    case "EXPIRED":
      return { kind: "EXPIRED", requestKey, expiredAt: metadata.expiredAt };
    case "DELETED":
      return { kind: "DELETED", requestKey, deletedAt: metadata.deletedAt };
    default:
      return assertUnexpectedMetadata(metadata);
  }
}

function failureState(
  requestKey: string,
  error: unknown,
): AlertMediaPanelState {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { kind: "DENIED", requestKey, status: error.status };
    }
    if (error.status === 404) {
      // 백엔드가 기능 비활성을 구분 가능한 코드로 알려준다.
      if (error.message.includes(MEDIA_FEATURE_DISABLED_CODE)) {
        return { kind: "FEATURE_DISABLED", requestKey };
      }
      return { kind: "UNAVAILABLE", requestKey };
    }
    return {
      kind: "ERROR",
      requestKey,
      retryable:
        error.status === 408 || error.status === 429 || error.status >= 500,
      message: "영상 상태를 확인하지 못했습니다.",
    };
  }
  return {
    kind: "ERROR",
    requestKey,
    retryable:
      error instanceof TypeError && !(error instanceof AlertMediaResponseError),
    message: "영상 상태를 확인하지 못했습니다.",
  };
}

function isActive(
  request: ActiveRequest | null,
  generation: number,
  requestKey: string,
): boolean {
  return (
    request !== null &&
    !request.controller.signal.aborted &&
    request.generation === generation &&
    request.requestKey === requestKey
  );
}

function assertUnexpectedAction(action: never): never {
  throw new UnexpectedAlertMediaActionError(
    `Unexpected alert media action: ${JSON.stringify(action)}`,
  );
}

function assertUnexpectedMetadata(metadata: never): never {
  throw new UnexpectedAlertMediaActionError(
    `Unexpected alert media metadata: ${JSON.stringify(metadata)}`,
  );
}
