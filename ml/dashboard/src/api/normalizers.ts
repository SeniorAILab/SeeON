import { getClipVideoUrl } from './session';
import type { Camera, CameraRegistry, CameraStatus, CameraTestResult, Clip, ClipLabel, SystemSnapshot } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(record: Record<string, unknown>, keys: string[], defaultValue = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return defaultValue;
}

function pickNullableString(record: Record<string, unknown>, keys: string[]): string | null {
  const value = pickString(record, keys);
  return value || null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function pickBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return null;
}

function normalizeStatus(record: Record<string, unknown>): CameraStatus {
  const explicit = pickString(record, ['status']);
  if (explicit === 'online' || explicit === 'offline' || explicit === 'starting' || explicit === 'unknown') {
    return explicit;
  }
  if (record.online === true) return 'online';
  if (record.online === false) return 'offline';
  return 'unknown';
}

function maskRtsp(value: string | null): string {
  if (!value) {
    return 'RTSP URL 비공개';
  }
  try {
    const url = new URL(value);
    if (!url.hostname) {
      return 'RTSP URL 비공개';
    }
    url.hostname = 'redacted-camera';
    url.username = url.username ? '***' : '';
    url.password = url.password ? '***' : '';
    return url.toString();
  } catch {
    return 'RTSP URL 비공개';
  }
}

export function normalizeCamera(value: unknown): Camera | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = pickString(value, ['id', 'camera_id']);
  if (!id) {
    return null;
  }

  const rtspMasked = pickString(value, ['rtsp_url_masked', 'rtspUrlMasked']);
  const rtspPlain = pickNullableString(value, ['rtsp_url', 'rtspUrl']);
  const domains = isRecord(value.domains) ? Object.fromEntries(Object.entries(value.domains).map(([key, entry]) => [key, Boolean(entry)])) : null;

  return {
    id,
    label: pickString(value, ['label', 'name'], '이름 없는 카메라'),
    rtsp_url_masked: rtspMasked || maskRtsp(rtspPlain),
    space_id: pickNullableString(value, ['space_id', 'spaceId']),
    backend_camera_id: pickNullableString(value, ['backend_camera_id', 'backendCameraId', 'facilityId']),
    status: normalizeStatus(value),
    created_at: pickString(value, ['created_at', 'createdAt'], new Date().toISOString()),
    threshold: pickNumber(value, ['threshold']),
    domains,
    bed_count: pickNumber(value, ['bed_count', 'bedCount']),
    night_start: pickNullableString(value, ['night_start', 'nightStart']),
    night_end: pickNullableString(value, ['night_end', 'nightEnd']),
  };
}

export function normalizeCameraRegistry(value: unknown): CameraRegistry {
  if (Array.isArray(value)) {
    return { registry_version: value.length, cameras: value.map(normalizeCamera).filter((camera): camera is Camera => Boolean(camera)) };
  }
  if (!isRecord(value)) {
    return { registry_version: 0, cameras: [] };
  }
  const rawCameras = Array.isArray(value.cameras) ? value.cameras : [];
  return {
    registry_version: typeof value.registry_version === 'number' ? value.registry_version : rawCameras.length,
    cameras: rawCameras.map(normalizeCamera).filter((camera): camera is Camera => Boolean(camera)),
  };
}

export function normalizeClip(value: unknown): Clip | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = pickString(value, ['id', 'clip_id']);
  if (!id) {
    return null;
  }
  const label = pickString(value, ['label', 'review_label']);
  // Legacy manifests predate video_available: assume playable unless told otherwise.
  const videoAvailable = pickBoolean(value, ['video_available', 'videoAvailable']);
  return {
    id,
    camera_id: pickNullableString(value, ['camera_id', 'cameraId']),
    camera_label: pickString(value, ['camera_label', 'cameraLabel', 'camera'], '카메라 미상'),
    event_type: pickString(value, ['event_type', 'eventType', 'type', 'event_ref', 'eventRef'], '이벤트'),
    created_at: pickNullableString(value, ['created_at', 'createdAt', 'timestamp', 'started_at', 'startedAt']),
    label: normalizeClipLabel(label),
    video_path: getClipVideoUrl(id),
    video_available: videoAvailable ?? true,
    video_error: pickNullableString(value, ['video_error', 'videoError']),
  };
}

function normalizeClipLabel(label: string): ClipLabel | null {
  if (label === 'TRUE_POSITIVE' || label === 'FALSE_POSITIVE' || label === 'UNREVIEWED') {
    return label;
  }
  return null;
}

export function normalizeCameraTestResult(value: unknown): CameraTestResult {
  if (!isRecord(value)) {
    return { ok: false, error_class: 'decode' };
  }
  const result: CameraTestResult = { ok: value.ok === true };
  const errorClass = pickString(value, ['error_class', 'errorClass']);
  const width = pickNumber(value, ['width']);
  const height = pickNumber(value, ['height']);
  if (errorClass) result.error_class = errorClass;
  if (width !== null) result.width = width;
  if (height !== null) result.height = height;
  return result;
}

function normalizeHistory(value: unknown): SystemSnapshot['update_history'] {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((entry) => ({
    id: pickString(entry, ['id']) || undefined,
    version: pickString(entry, ['version']) || undefined,
    created_at: pickString(entry, ['created_at', 'createdAt']) || undefined,
    status: pickString(entry, ['status']) || undefined,
  }));
}

export function normalizeSystemSnapshot(value: unknown): SystemSnapshot {
  const record = isRecord(value) ? value : {};
  const backend = isRecord(record.backend) ? record.backend : {};
  const imageDigests = isRecord(record.image_digests) ? record.image_digests : null;
  const storage = isRecord(record.storage) ? record.storage : {};
  const clipStore = isRecord(storage.clip_store) ? storage.clip_store : null;

  return {
    backend: {
      configured: pickBoolean(backend, ['configured']) ?? false,
      reachable: pickBoolean(backend, ['reachable']),
      last_ok_at: pickNullableString(backend, ['last_ok_at', 'lastOkAt']),
    },
    version: pickString(record, ['version'], 'unknown'),
    image_digests: imageDigests ? {
      ml_api: pickNullableString(imageDigests, ['ml_api', 'mlApi']),
      ml_worker: pickNullableString(imageDigests, ['ml_worker', 'mlWorker']),
    } : undefined,
    storage: clipStore ? {
      clip_store: {
        total_bytes: pickNumber(clipStore, ['total_bytes', 'totalBytes']),
        used_bytes: pickNumber(clipStore, ['used_bytes', 'usedBytes']),
        used_pct: pickNumber(clipStore, ['used_pct', 'usedPct']),
      },
    } : undefined,
    update_history: normalizeHistory(record.update_history),
    rollback_history: normalizeHistory(record.rollback_history),
  };
}
