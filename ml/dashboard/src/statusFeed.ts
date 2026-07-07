export type FeedEvent = {
  id: string;
  cameraId: string | null;
  cameraLabel: string;
  eventType: string;
  title: string;
  detail: string;
  timestamp: string | null;
};

const EVENT_KEYS = ['events', 'recent_events', 'camera_events', 'alerts', 'incidents'];
const HEARTBEAT_KEYS = ['heartbeat', 'heartbeats', 'worker_heartbeat', 'worker', 'workers'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarize(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length}개 항목`;
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .slice(0, 3)
      .map(([key, entry]) => `${key}: ${summarize(entry)}`)
      .join(' · ');
  }
  return '상세 없음';
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function normalizeEventType(value: string | null): string {
  if (!value) {
    return 'event';
  }
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (normalized.includes('bed-exit') || normalized.includes('침대-이탈')) {
    return 'bed-exit';
  }
  if (normalized.includes('fall') || normalized.includes('낙상')) {
    return 'fall';
  }
  return normalized || 'event';
}

function normalizeEvent(value: unknown, index: number): FeedEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const cameraId = pickString(value, ['camera_id', 'cameraId', 'source_camera_id', 'sourceCameraId']);
  const cameraLabel = pickString(value, ['camera_label', 'cameraLabel', 'camera', 'label']) ?? '카메라 미상';
  const rawEventType = pickString(value, ['event_type', 'eventType', 'type', 'kind', 'title', 'status']);
  const eventType = normalizeEventType(rawEventType);
  const title = pickString(value, ['title', 'type', 'event_type', 'kind', 'status']) ?? '상태 이벤트';
  const timestamp = pickString(value, ['created_at', 'timestamp', 'ts', 'time', 'last_seen_at']);
  const detail = pickString(value, ['message', 'detail', 'summary', 'description']) ?? summarize(value.payload ?? value.data ?? value);
  const eventId = pickString(value, ['id', 'event_id']) ?? `${cameraId ?? cameraLabel}-${eventType}-${timestamp ?? index}`;

  return {
    id: eventId,
    cameraId,
    cameraLabel,
    eventType,
    title,
    detail,
    timestamp,
  };
}

function collectEvents(value: unknown, events: FeedEvent[], seen: Set<unknown>): void {
  if (seen.has(value) || events.length >= 12) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const event = normalizeEvent(entry, index);
      if (event) {
        events.push(event);
      } else {
        collectEvents(entry, events, seen);
      }
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const key of EVENT_KEYS) {
    if (key in value) {
      collectEvents(value[key], events, seen);
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (isRecord(nestedValue) || Array.isArray(nestedValue)) {
      collectEvents(nestedValue, events, seen);
    }
  }
}

export function extractEvents(status: unknown): FeedEvent[] {
  const events: FeedEvent[] = [];
  collectEvents(status, events, new Set());
  return events;
}

export function extractHeartbeat(status: unknown): string {
  if (!isRecord(status)) {
    return 'heartbeat 정보 없음';
  }

  for (const key of HEARTBEAT_KEYS) {
    const value = status[key];
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (isRecord(value) || Array.isArray(value)) {
      return summarize(value);
    }
  }

  return summarize(status);
}
