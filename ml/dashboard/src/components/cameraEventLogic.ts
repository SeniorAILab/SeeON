import type { Camera, Clip } from '../api/client';
import type { FeedEvent } from '../statusFeed';

export type EventOption = {
  type: string;
  label: string;
  latestTimestamp: string | null;
  recentCount: number;
};

export function formatEventTime(value: string | null): string {
  if (!value) return '시간 정보 없음';
  return new Date(value).toLocaleString('ko-KR');
}

export function normalizeEventTypeName(value: string | null | undefined): string {
  if (!value) return 'event';
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (normalized.includes('bed-exit') || normalized.includes('침대-이탈')) return 'bed-exit';
  if (normalized.includes('fall') || normalized.includes('낙상')) return 'fall';
  return normalized || 'event';
}

export function eventLabel(type: string): string {
  const normalized = normalizeEventTypeName(type);
  if (normalized === 'bed-exit') return '침대 이탈';
  if (normalized === 'fall') return '낙상';
  return type;
}

function cameraOwnsEvent(camera: Camera, event: FeedEvent): boolean {
  if (event.cameraId && (event.cameraId === camera.id || event.cameraId === camera.backend_camera_id)) {
    return true;
  }
  return event.cameraLabel === camera.label;
}

function cameraOwnsClip(camera: Camera, clip: Clip): boolean {
  if (clip.camera_id && (clip.camera_id === camera.id || clip.camera_id === camera.backend_camera_id)) {
    return true;
  }
  return clip.camera_label === camera.label;
}

function isSameEventType(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeEventTypeName(left) === normalizeEventTypeName(right);
}

export function buildEventOptions(camera: Camera | null, events: FeedEvent[], clips: Clip[]): EventOption[] {
  if (!camera) return [];

  const options = new Map<string, EventOption>();
  const addOption = (rawType: string | null | undefined, timestamp: string | null = null): void => {
    const type = normalizeEventTypeName(rawType);
    const current = options.get(type);
    if (!current) {
      options.set(type, {
        type,
        label: eventLabel(type),
        latestTimestamp: timestamp,
        recentCount: timestamp ? 1 : 0,
      });
      return;
    }
    options.set(type, {
      ...current,
      latestTimestamp: timestamp ?? current.latestTimestamp,
      recentCount: current.recentCount + (timestamp ? 1 : 0),
    });
  };

  Object.entries(camera.domains ?? {}).forEach(([domain, enabled]) => {
    if (enabled) addOption(domain);
  });
  events.filter((event) => cameraOwnsEvent(camera, event)).forEach((event) => addOption(event.eventType || event.title, event.timestamp));
  clips.filter((clip) => cameraOwnsClip(camera, clip)).forEach((clip) => addOption(clip.event_type, clip.created_at));
  if (options.size === 0) addOption('bed-exit');

  return [...options.values()].sort((left, right) => {
    if (left.type === 'bed-exit') return -1;
    if (right.type === 'bed-exit') return 1;
    return left.label.localeCompare(right.label, 'ko');
  });
}

export function filterEventsForCamera(camera: Camera | null, events: FeedEvent[]): FeedEvent[] {
  if (!camera) return [];
  return events.filter((event) => cameraOwnsEvent(camera, event));
}

export function filterClipsForCameraEvent(camera: Camera | null, clips: Clip[], eventType: string | null): Clip[] {
  if (!camera || !eventType) return [];
  return clips.filter((clip) => cameraOwnsClip(camera, clip) && isSameEventType(clip.event_type, eventType));
}
