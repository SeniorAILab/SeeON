import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRelayToken, createCamera, fetchClips, getApiBase, getCameraStreamUrl, getConfiguredRelayToken, setRelayToken, testCamera, updateCamera, updateCameraDecodeBackend } from './client';

afterEach(() => {
  clearRelayToken();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('api client contracts', () => {
  it('serializes camera create without a user-entered id or space_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cam-1', label: '301호', rtsp_url_masked: 'rtsp://user:***@camera/stream', space_id: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await createCamera({ label: ' 301호 ', rtsp_url: ' rtsp://camera/stream ' });
    await updateCamera('cam-1', { label: ' 301호 A ', rtsp_url: ' rtsp://camera/a ', space_id: ' space-302 ' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/cameras', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ label: '301호', rtsp_url: 'rtsp://camera/stream' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/cameras/cam-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ label: '301호 A', rtsp_url: 'rtsp://camera/a', space_id: 'space-302' }),
    }));
  });

  it('exposes the dashboard API base for operator-facing backend copy', () => {
    expect(getApiBase()).toBe('/api/v1');
  });

  it('routes requests, stream URLs, and clip URLs through the configured ML API base', async () => {
    vi.stubEnv('VITE_ML_API_BASE_URL', ' http://edge-ml-api.local:8000/api/v1/ ');
    setRelayToken('relay token:/+');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ clips: [{ clip_id: 'clip/1', camera_id: 'cam/1', event_type: 'bed-exit' }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await testCamera('cam/1');
    const clips = await fetchClips('cam/1');

    expect(getApiBase()).toBe('http://edge-ml-api.local:8000/api/v1');
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://edge-ml-api.local:8000/api/v1/cameras/cam%2F1/test', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://edge-ml-api.local:8000/api/v1/clips?camera_id=cam%2F1', expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'application/json' }),
    }));
    expect(getCameraStreamUrl('cam/1')).toBe('http://edge-ml-api.local:8000/api/v1/streams/cam%2F1?token=relay%20token%3A%2F%2B');
    expect(clips[0]?.video_path).toBe('http://edge-ml-api.local:8000/api/v1/clips/clip%2F1/video?token=relay%20token%3A%2F%2B');
  });

  it('uses only an explicitly configured relay token, separate from the local admin password', () => {
    expect(getConfiguredRelayToken()).toBeNull();
    vi.stubEnv('VITE_ML_API_RELAY_TOKEN', 'configured-relay-token');
    expect(getConfiguredRelayToken()).toBe('configured-relay-token');
    expect(getConfiguredRelayToken()).not.toBe('admin');
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

  it('fetches clips scoped to the selected camera', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ clips: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchClips('cam/1');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/clips?camera_id=cam%2F1', expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'application/json' }),
    }));
  });

  it('builds the real ml-api camera stream URL with a query token for img usage', () => {
    setRelayToken('relay token:/+');

    expect(getCameraStreamUrl('cam/1')).toBe('/api/v1/streams/cam%2F1?token=relay%20token%3A%2F%2B');
  });

  it('normalizes the real ml-api clip manifest shape for bed-exit playback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        clips: [{
          clip_id: 'clip-1',
          camera_id: 'cam-1',
          event_ref: '0:0',
          event_type: 'bed-exit',
          started_at: '2026-07-06T00:00:00Z',
          duration_s: 4.2,
          codec: 'mp4v',
          path: 'clips/clip-1/clip.mp4',
          finalized: true,
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const clips = await fetchClips();

    expect(clips[0]).toMatchObject({
      id: 'clip-1',
      camera_id: 'cam-1',
      event_type: 'bed-exit',
      created_at: '2026-07-06T00:00:00Z',
      video_path: '/api/v1/clips/clip-1/video',
    });
  });

  it('patches only decode_backend when changing a camera decode backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cam-1', label: '301호', rtsp_url_masked: 'rtsp://user:***@camera/stream', space_id: null, decode_backend: 'nvdec' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const updated = await updateCameraDecodeBackend('cam-1', 'nvdec');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/cameras/cam-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ decode_backend: 'nvdec' }),
    }));
    expect(updated.decode_backend).toBe('nvdec');
  });
});
