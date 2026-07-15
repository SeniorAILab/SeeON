import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { uid } from "@/lib/utils";
import { alertService } from "@/services/alertService";
import {
  createAlertMediaCoordinator,
  createAlertMediaRequestKey,
  type AlertMediaPanelState,
  type AlertMediaRequestIdentity,
} from "@/services/alertMediaState";
import type { AlertMediaAccessAction } from "@/services/api/alertMedia";
import { AlertEvidencePlayer } from "./AlertEvidencePlayer";
import { AlertEvidenceState } from "./AlertEvidenceState";
import { teardownMediaElement } from "./mediaElement";

type AlertEvidencePanelProps = {
  readonly identity: AlertMediaRequestIdentity;
};

export function AlertEvidencePanel({ identity }: AlertEvidencePanelProps) {
  const { facilityId, alertId, userId } = identity;
  const requestIdentity = useMemo(
    () => ({ facilityId, alertId, userId }),
    [alertId, facilityId, userId],
  );
  const requestKey = createAlertMediaRequestKey(requestIdentity);
  const coordinator = useMemo(
    () => createAlertMediaCoordinator((requestedAlertId, signal) => (
      alertService.getMedia(requestedAlertId, signal)
    )),
    [],
  );
  const [state, setState] = useState<AlertMediaPanelState>({
    kind: "LOADING",
    requestKey,
  });
  const [accessError, setAccessError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playbackRefreshCount = useRef(0);
  const accessControllerRef = useRef<AbortController | null>(null);
  const activeRequestKeyRef = useRef<string | null>(null);

  const detachVideo = useCallback(() => {
    teardownMediaElement(videoRef.current);
    videoRef.current = null;
  }, []);

  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    if (video === null && videoRef.current !== null) detachVideo();
    videoRef.current = video;
  }, [detachVideo]);

  const loadMetadata = useCallback(() => {
    void coordinator.load(requestIdentity, setState);
  }, [coordinator, requestIdentity]);

  useEffect(() => {
    playbackRefreshCount.current = 0;
    setAccessError(null);
    const accessController = new AbortController();
    accessControllerRef.current = accessController;
    activeRequestKeyRef.current = requestKey;
    loadMetadata();

    return () => {
      coordinator.cancel();
      accessController.abort();
      if (activeRequestKeyRef.current === requestKey) {
        activeRequestKeyRef.current = null;
      }
      if (accessControllerRef.current === accessController) {
        accessControllerRef.current = null;
      }
      detachVideo();
    };
  }, [coordinator, detachVideo, loadMetadata, requestKey]);

  const recordAccess = useCallback(async (action: AlertMediaAccessAction) => {
    const controller = accessControllerRef.current;
    if (controller === null || controller.signal.aborted) return;
    const interactionRequestKey = requestKey;

    try {
      await alertService.recordMediaAccess({
        alertId,
        action,
        interactionId: uid("alert-media"),
        signal: controller.signal,
      });
      if (activeRequestKeyRef.current === interactionRequestKey) {
        setAccessError(null);
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        activeRequestKeyRef.current !== interactionRequestKey
      ) {
        return;
      }
      if (error instanceof Error) {
        setAccessError("영상 접근 기록을 저장하지 못했습니다.");
        return;
      }
      throw error;
    }
  }, [alertId, requestKey]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement === videoRef.current) {
        void recordAccess("FULLSCREEN_ENTERED");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [recordAccess]);

  const handlePlaybackError = useCallback(() => {
    detachVideo();
    if (playbackRefreshCount.current === 0) {
      playbackRefreshCount.current = 1;
      loadMetadata();
      return;
    }
    setState({
      kind: "ERROR",
      requestKey,
      retryable: true,
      message: "영상을 재생하지 못했습니다.",
    });
  }, [detachVideo, loadMetadata, requestKey]);

  const handleRetry = useCallback(() => {
    playbackRefreshCount.current = 0;
    setAccessError(null);
    detachVideo();
    loadMetadata();
  }, [detachVideo, loadMetadata]);

  const visibleState: AlertMediaPanelState = state.requestKey === requestKey
    ? state
    : { kind: "LOADING", requestKey };

  if (visibleState.kind !== "READY") {
    return <AlertEvidenceState state={visibleState} onRetry={handleRetry} />;
  }

  return (
    <div className="space-y-2">
      <AlertEvidencePlayer
        key={visibleState.requestKey}
        alertId={alertId}
        clip={visibleState.clip}
        setVideoElement={setVideoElement}
        onPlay={() => void recordAccess("PLAY_STARTED")}
        onPlaybackError={handlePlaybackError}
      />
      {accessError === null ? null : (
        <p role="alert" className="rounded-lg bg-status-cautionBg px-3 py-2 text-sm text-status-caution">
          {accessError}
        </p>
      )}
    </div>
  );
}
