import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRelayToken, createCamera, fetchClips, setRelayToken, testCamera, updateCamera } from './client';

afterEach(() => {
  clearRelayToken();
  vi.restoreAllMocks();
});

describe('api client contracts', () => {
  it('serializes camera create and patch bodies with snake_case fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cam-1', label: '301호', rtsp_url_masked: 'rtsp://user:***@camera/stream', space_id: 'space-301' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await createCamera({ label: ' 301호 ', rtsp_url: ' rtsp://camera/stream ', space_id: ' space-301 ' });
    await updateCamera('cam-1', { label: ' 301호 A ', rtsp_url: ' rtsp://camera/a ', space_id: ' space-302 ' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/cameras', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ label: '301호', rtsp_url: 'rtsp://camera/stream', space_id: 'space-301' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/cameras/cam-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ label: '301호 A', rtsp_url: 'rtsp://camera/a', space_id: 'space-302' }),
    }));
  });
  it('posts camera connection tests to the registered camera id endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await testCamera('cam-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/cameras/cam-1/test', expect.objectContaining({ method: 'POST' }));
  });

  it('normalizes clip video URLs with the in-memory relay token as a query token', async () => {
    setRelayToken('relay token:/+');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ clips: [{ id: 'clip/1', camera_label: '301호', event_type: 'fall', video_path: '/ignored' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const clips = await fetchClips();

    expect(clips[0]?.video_path).toBe('/api/v1/clips/clip%2F1/video?token=relay%20token%3A%2F%2B');
  });
});
