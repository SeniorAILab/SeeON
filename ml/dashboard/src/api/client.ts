import { requestJson } from './http';
import { normalizeCamera, normalizeCameraRegistry, normalizeCameraTestResult, normalizeClip, normalizeSystemSnapshot } from './normalizers';
import { clearRelayToken, getApiBase, getCameraStreamUrl, getConfiguredRelayToken, getRelayToken, setRelayToken } from './session';
import type { Camera, CameraInput, CameraPatchInput, CameraRegistry, CameraTestResult, Clip, ClipLabel, SystemSnapshot } from './types';

export type {
  Camera,
  CameraInput,
  CameraPatchInput,
  CameraRegistry,
  CameraStatus,
  CameraTestResult,
  Clip,
  ClipLabel,
  SystemSnapshot,
} from './types';

export {
  clearRelayToken,
  getApiBase,
  getCameraStreamUrl,
  getConfiguredRelayToken,
  getRelayToken,
  setRelayToken,
} from './session';

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
  return normalizeCameraRegistry(await requestJson('/cameras'));
}

export async function createCamera(input: CameraInput): Promise<Camera> {
  const camera = normalizeCamera(await requestJson('/cameras', { method: 'POST', body: cameraBody(input) }));
  if (!camera) {
    throw new Error('Invalid camera response');
  }
  return camera;
}

export async function updateCamera(cameraId: string, input: CameraPatchInput): Promise<Camera> {
  const camera = normalizeCamera(
    await requestJson(`/cameras/${encodeURIComponent(cameraId)}`, { method: 'PATCH', body: cameraBody(input) }),
  );
  if (!camera) {
    throw new Error('Invalid camera response');
  }
  return camera;
}

export async function deleteCamera(cameraId: string): Promise<void> {
  await requestJson(`/cameras/${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
}

export async function testCamera(cameraId: string): Promise<CameraTestResult> {
  return normalizeCameraTestResult(await requestJson(`/cameras/${encodeURIComponent(cameraId)}/test`, { method: 'POST' }));
}

export async function fetchStatus(): Promise<unknown> {
  return requestJson('/status');
}

export async function fetchSystem(): Promise<SystemSnapshot> {
  return normalizeSystemSnapshot(await requestJson('/system'));
}

export async function fetchClips(cameraId?: string): Promise<Clip[]> {
  const query = cameraId?.trim() ? `?camera_id=${encodeURIComponent(cameraId.trim())}` : '';
  const value = await requestJson(`/clips${query}`);
  const entries = Array.isArray(value) ? value : normalizeClipEntries(value);
  return entries.map(normalizeClip).filter((clip): clip is Clip => Boolean(clip));
}

function normalizeClipEntries(value: unknown): unknown[] {
  return typeof value === 'object' && value !== null && 'clips' in value && Array.isArray(value.clips) ? value.clips : [];
}

export async function labelClip(clipId: string, label: ClipLabel): Promise<Clip> {
  const clip = normalizeClip(
    await requestJson(`/clips/${encodeURIComponent(clipId)}/label`, {
      method: 'PUT',
      body: JSON.stringify({ label: label === 'UNREVIEWED' ? null : label }),
    }),
  );
  if (!clip) {
    throw new Error('Invalid clip response');
  }
  return clip;
}
