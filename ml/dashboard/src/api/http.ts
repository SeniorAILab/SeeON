import { getApiBase, getAuthHeaders } from './session';

export async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...getAuthHeaders(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}
