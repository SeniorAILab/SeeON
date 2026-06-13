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
 * The hook merges replay + live events using alertSeq for dedup/order.
 */

import { useEffect, useRef, useState } from "react";
import { mergeAlerts, type SseAlert, type ResidentStatus } from "./sse-utils";

export type { SseAlert, ResidentStatus };

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
}

export function useAlertStream(options: UseAlertStreamOptions = {}): AlertStreamState {
  const {
    initialAlerts = [],
    initialStatuses = [],
    maxAlerts = 100,
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

  useEffect(() => {
    let cancelled = false;
    const es = new EventSource("/api/sse");

    es.onopen = () => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, connected: true }));
    };

    // Default message event → alert payload.
    es.onmessage = (event: MessageEvent<string>) => {
      if (cancelled) return;
      try {
        const incoming = JSON.parse(event.data) as SseAlert;
        setState((prev) => ({
          ...prev,
          alerts: mergeAlerts(prev.alerts, [incoming]).slice(
            0,
            maxAlertsRef.current,
          ),
        }));
      } catch {
        // ignore malformed frames
      }
    };

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
