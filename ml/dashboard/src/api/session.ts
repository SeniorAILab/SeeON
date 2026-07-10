export const DEFAULT_API_BASE = '/api/v1';

let relayToken: string | null = null;

export function getApiBase(): string {
  return normalizeApiBase(import.meta.env.VITE_ML_API_BASE_URL);
}

export function getConfiguredRelayToken(): string | null {
  const configured = import.meta.env.VITE_ML_API_RELAY_TOKEN;
  return typeof configured === 'string' && configured.trim() ? configured.trim() : null;
}

export function setRelayToken(token: string | null): void {
  relayToken = token?.trim() || null;
}

export function clearRelayToken(): void {
  relayToken = null;
}

export function getRelayToken(): string | null {
  return relayToken;
}

export function getCameraStreamUrl(cameraId: string): string {
  const tokenQuery = relayToken ? `?token=${encodeURIComponent(relayToken)}` : '';
  return `${getApiBase()}/streams/${encodeURIComponent(cameraId)}${tokenQuery}`;
}

export function getClipVideoUrl(clipId: string): string {
  const tokenQuery = relayToken ? `?token=${encodeURIComponent(relayToken)}` : '';
  return `${getApiBase()}/clips/${encodeURIComponent(clipId)}/video${tokenQuery}`;
}

export function getAuthHeaders(): Record<string, string> {
  return relayToken ? { Authorization: `Bearer ${relayToken}` } : {};
}

function normalizeApiBase(value: string | undefined): string {
  const configured = value?.trim() || DEFAULT_API_BASE;
  if (configured === '/') return '';
  return configured.replace(/\/+$/, '');
}
