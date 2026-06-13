"use client";

/**
 * SSE client for the real-time alert stream.
 *
 * Connects to /api/sse (rewired to backend via Next.js rewrites).
 * The browser's EventSource automatically:
 *   - Includes the session cookie (same-origin).
 *   - Sends Last-Event-ID on reconnect (set from id: <alertSeq> frames).
 *   - Retries with back-off on connection loss.
 *
 * On reconnect the backend:
 *   1. Replays alerts WHERE alertSeq > Last-Event-ID ORDER BY ASC.
 *   2. Emits a status-snapshot event with current ResidentStatus[].
 *
 * Live events:
 *   - Unnamed messages → alert payload (handled by onmessage).
 *     Also optimistically updates the matching resident's status badge.
 *   - `event: status` → SseStatusEvent (authoritative; merges into statuses).
 *   - `event: status-snapshot` → full ResidentStatus[] replacement on connect.
 *
 * The hook merges replay + live events using alertSeq for dedup/order.
 */

import { useEffect, useRef, useState } from "react";
import {
  mergeAlerts,
  mergeStatuses,
  type SseAlert,
  type ResidentStatus,
  type SseStatusEvent,
} from "./sse-utils";

export type { SseAlert, ResidentStatus, SseStatusEvent };

export interface AlertStreamState {
  alerts: SseAlert[];
  statuses: ResidentStatus[];
  connected: boolean;
}

interface UseAlertStreamOptions {
  initialAlerts?: SseAlert[];
  initialStatuses?: ResidentStatus[];
  /** Cap the in-memory alert list. Default 100. */
  maxAlerts?: number;
  /**
   * Called when the backend sends `event: session-invalid` (session expired/revoked).
   * Defaults to `window.location.assign('/login')`.
   */
  onSessionInvalid?: () => void;
}

export function useAlertStream(options: UseAlertStreamOptions = {}): AlertStreamState {
  const {
    initialAlerts = [],
    initialStatuses = [],
    maxAlerts = 100,
    onSessionInvalid,
  } = options;

  const [state, setState] = useState<AlertStreamState>({
    alerts: initialAlerts,
    statuses: initialStatuses,
    connected: false,
  });

  // Keep maxAlerts stable in the effect closure.
  const maxAlertsRef = useRef(maxAlerts);
  useEffect(() => {
    maxAlertsRef.current = maxAlerts;
  }, [maxAlerts]);

  // Keep onSessionInvalid stable in the effect closure (avoids re-connecting on prop change).
  const onSessionInvalidRef = useRef(onSessionInvalid);
  useEffect(() => {
    onSessionInvalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);

  useEffect(() => {
    let cancelled = false;
    const es = new EventSource("/api/sse");

    es.onopen = () => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, connected: true }));
    };

    // Default message event → alert payload.
    // Also optimistically updates the resident's status badge
    // (status event is authoritative; this is best-effort until it arrives).
    es.onmessage = (event: MessageEvent<string>) => {
      if (cancelled) return;
      try {
        const incoming = JSON.parse(event.data) as SseAlert;
        setState((prev) => {
          const alerts = mergeAlerts(prev.alerts, [incoming]).slice(
            0,
            maxAlertsRef.current,
          );
          // Optimistic badge update derived from alert probability.
          const optimisticState =
            incoming.probability >= 0.8
              ? "FALL"
              : incoming.probability >= 0.5
                ? "WARNING"
                : "NORMAL";
          const statuses = prev.statuses.map((s) =>
            s.residentId === incoming.residentId
              ? { ...s, state: optimisticState as ResidentStatus["state"] }
              : s,
          );
          return { ...prev, alerts, statuses };
        });
      } catch {
        // ignore malformed frames
      }
    };

    // Named event: authoritative per-resident status update (AC5/AC6).
    es.addEventListener("status", (event: MessageEvent<string>) => {
      if (cancelled) return;
      try {
        const statusEvent = JSON.parse(event.data) as SseStatusEvent;
        setState((prev) => ({
          ...prev,
          statuses: mergeStatuses(prev.statuses, statusEvent),
        }));
      } catch {
        // ignore
      }
    });

    // Named event: full status snapshot sent on connect/reconnect (F8).
    es.addEventListener("status-snapshot", (event: MessageEvent<string>) => {
      if (cancelled) return;
      try {
        const statuses = JSON.parse(event.data) as ResidentStatus[];
        setState((prev) => ({ ...prev, statuses }));
      } catch {
        // ignore
      }
    });

    // Named event: backend signals session expiry/revoke (F6/AC4 re-auth tick).
    // Close the EventSource first to prevent stale '재연결 중...' state, then
    // redirect to /login (or invoke the caller-supplied callback).
    es.addEventListener("session-invalid", () => {
      if (cancelled) return;
      cancelled = true;
      es.close();
      setState((prev) => ({ ...prev, connected: false }));
      if (onSessionInvalidRef.current) {
        onSessionInvalidRef.current();
      } else if (typeof window !== "undefined") {
        window.location.assign("/login");
      }
    });

    // EventSource auto-reconnects; mark as disconnected until onopen fires again.
    es.onerror = () => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, connected: false }));
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, []); // mount once — EventSource manages its own lifecycle

  return state;
}
