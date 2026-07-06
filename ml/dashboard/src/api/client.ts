export type CameraStatus = 'online' | 'offline' | 'starting' | 'unknown';

export type Camera = {
  id: string;
  label: string;
  rtsp_url_masked: string;
  space_id: string | null;
  backend_camera_id: string | null;
  status: CameraStatus;
  created_at: string;
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

export type CameraTestResult = {
  ok: boolean;
  error_class?: 'timeout' | 'decode' | 'auth';
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
};

const API_BASE = '/api/v1';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchCameras(): Promise<CameraRegistry> {
  return requestJson<CameraRegistry>('/cameras');
}

export function createCamera(input: CameraInput): Promise<Camera> {
  const body = JSON.stringify({
    label: input.label.trim(),
    rtsp_url: input.rtsp_url.trim(),
    ...(input.space_id?.trim() ? { space_id: input.space_id.trim() } : {}),
  });

  return requestJson<Camera>('/cameras', { method: 'POST', body });
}

export function testCamera(cameraId: string): Promise<CameraTestResult> {
  return requestJson<CameraTestResult>(`/cameras/${encodeURIComponent(cameraId)}/test`, {
    method: 'POST',
  });
}

export function fetchStatus(): Promise<unknown> {
  return requestJson<unknown>('/status');
}

export function fetchSystem(): Promise<SystemSnapshot> {
  return requestJson<SystemSnapshot>('/system');
}
