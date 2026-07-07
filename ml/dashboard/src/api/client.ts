export type CameraStatus = 'online' | 'offline' | 'starting' | 'unknown';

export type Camera = {
  id: string;
  label: string;
  rtsp_url_masked: string;
  space_id: string | null;
  backend_camera_id: string | null;
  status: CameraStatus;
  created_at: string;
  threshold?: number | null;
  domains?: Record<string, boolean> | null;
  bed_count?: number | null;
  night_start?: string | null;
  night_end?: string | null;
};

export type CameraRegistry = {
  registry_version: number;
  cameras: Camera[];
};

export type CameraInput = {
  label: string;
  rtsp_url: string;
  space_id?: string;
};

export type CameraPatchInput = Partial<CameraInput> & {
  detectionSettings?: {
    threshold: number;
    domains: Record<string, boolean>;
    bedCount: number;
    nightWindow: { start: string; end: string };
  };
};

export type CameraTestResult = {
  ok: boolean;
  error_class?: 'timeout' | 'decode' | 'auth' | string;
  width?: number;
  height?: number;
};

export type SystemSnapshot = {
  backend: {
    configured: boolean;
    reachable: boolean | null;
    last_ok_at: string | null;
  };
  version: string;
  image_digests?: {
    ml_api: string | null;
    ml_worker: string | null;
  };
  storage?: {
    clip_store?: {
      total_bytes: number | null;
      used_bytes: number | null;
      used_pct: number | null;
    };
  };
  update_history?: Array<{ id?: string; version?: string; created_at?: string; status?: string }>;
  rollback_history?: Array<{ id?: string; version?: string; created_at?: string; status?: string }>;
};

export type ClipLabel = 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'UNREVIEWED';

export type Clip = {
  id: string;
  camera_id: string | null;
  camera_label: string;
  event_type: string;
  created_at: string | null;
  label: ClipLabel | null;
  video_path: string;
};

const API_BASE = '/api/v1';
const DEFAULT_DASHBOARD_RELAY_TOKEN = 'local-edge-relay-token';
let relayToken: string | null = null;

export function getApiBase(): string {
  return API_BASE;
}

export function getConfiguredRelayToken(): string {
  const configured = import.meta.env.VITE_ML_API_RELAY_TOKEN;
  return typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_DASHBOARD_RELAY_TOKEN;
}

export function setRelayToken(token: string): void {
  relayToken = token.trim() || null;
}

export function clearRelayToken(): void {
  relayToken = null;
}

export function getRelayToken(): string | null {
  return relayToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return fallback;
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

function normalizeStatus(record: Record<string, unknown>): CameraStatus {
  const explicit = pickString(record, ['status']);
  if (explicit === 'online' || explicit === 'offline' || explicit === 'starting' || explicit === 'unknown') {
    return explicit;
  }
  if (record.online === true) {
    return 'online';
  }
  if (record.online === false) {
    return 'offline';
  }
  return 'unknown';
}

function maskRtsp(value: string | null): string {
  if (!value) {
    return 'RTSP URL 비공개';
  }
  return value.replace(/(rtsp[s]?:\/\/)([^:@/]+):([^@/]+)@/i, '$1$2:***@');
}

function normalizeCamera(value: unknown): Camera | null {
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

function normalizeCameraRegistry(value: unknown): CameraRegistry {
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

function normalizeClip(value: unknown): Clip | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = pickString(value, ['id', 'clip_id']);
  if (!id) {
    return null;
  }
  const label = pickString(value, ['label', 'review_label']);
  return {
    id,
    camera_id: pickNullableString(value, ['camera_id', 'cameraId']),
    camera_label: pickString(value, ['camera_label', 'cameraLabel', 'camera'], '카메라 미상'),
    event_type: pickString(value, ['event_type', 'eventType', 'type', 'event_ref', 'eventRef'], '이벤트'),
    created_at: pickNullableString(value, ['created_at', 'createdAt', 'timestamp', 'started_at', 'startedAt']),
    label: label === 'TRUE_POSITIVE' || label === 'FALSE_POSITIVE' || label === 'UNREVIEWED' ? label : null,
    video_path: `${API_BASE}/clips/${encodeURIComponent(id)}/video${relayToken ? `?token=${encodeURIComponent(relayToken)}` : ''}`,
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(relayToken ? { Authorization: `Bearer ${relayToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function cameraBody(input: CameraInput | CameraPatchInput): string {
  const body: Record<string, unknown> = {};
  if (input.label !== undefined) {
    body.label = input.label.trim();
  }
  if (input.rtsp_url !== undefined) {
    body.rtsp_url = input.rtsp_url.trim();
  }
  if (input.space_id !== undefined) {
    body.space_id = input.space_id.trim();
  }
  if ('detectionSettings' in input && input.detectionSettings) {
    body.detectionSettings = input.detectionSettings;
  }
  return JSON.stringify(body);
}

export async function fetchCameras(): Promise<CameraRegistry> {
  return normalizeCameraRegistry(await requestJson<unknown>('/cameras'));
}

export async function createCamera(input: CameraInput): Promise<Camera> {
  const camera = normalizeCamera(await requestJson<unknown>('/cameras', { method: 'POST', body: cameraBody(input) }));
  if (!camera) {
    throw new Error('Invalid camera response');
  }
  return camera;
}

export async function updateCamera(cameraId: string, input: CameraPatchInput): Promise<Camera> {
  const camera = normalizeCamera(
    await requestJson<unknown>(`/cameras/${encodeURIComponent(cameraId)}`, { method: 'PATCH', body: cameraBody(input) }),
  );
  if (!camera) {
    throw new Error('Invalid camera response');
  }
  return camera;
}

export async function deleteCamera(cameraId: string): Promise<void> {
  await requestJson<void>(`/cameras/${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
}

export function testCamera(cameraId: string): Promise<CameraTestResult> {
  return requestJson<CameraTestResult>(`/cameras/${encodeURIComponent(cameraId)}/test`, { method: 'POST' });
}


export function fetchStatus(): Promise<unknown> {
  return requestJson<unknown>('/status');
}

export function fetchSystem(): Promise<SystemSnapshot> {
  return requestJson<SystemSnapshot>('/system');
}

export async function fetchClips(): Promise<Clip[]> {
  const value = await requestJson<unknown>('/clips');
  const entries = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.clips) ? value.clips : [];
  return entries.map(normalizeClip).filter((clip): clip is Clip => Boolean(clip));
}

export async function labelClip(clipId: string, label: ClipLabel): Promise<Clip> {
  const clip = normalizeClip(
    await requestJson<unknown>(`/clips/${encodeURIComponent(clipId)}/label`, {
      method: 'PUT',
      // API label literal is TRUE_POSITIVE | FALSE_POSITIVE | null; the UI's
      // UNREVIEWED choice maps to null (clears the review verdict).
      body: JSON.stringify({ label: label === 'UNREVIEWED' ? null : label }),
    }),
  );
  if (!clip) {
    throw new Error('Invalid clip response');
  }
  return clip;
}
