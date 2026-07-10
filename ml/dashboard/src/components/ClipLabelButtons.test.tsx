import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clip } from '../api/client';
import { ClipLabelButtons } from './ClipLabelButtons';

const clip: Clip = {
  id: 'clip-1',
  camera_id: 'cam-1',
  camera_label: '301호',
  event_type: 'fall',
  created_at: '2026-07-06T00:00:00.000Z',
  label: null,
  video_path: '/api/v1/clips/clip-1/video',
  video_available: true,
  video_error: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClipLabelButtons', () => {
  it('sends TRUE_POSITIVE label to the clip label endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...clip, label: 'TRUE_POSITIVE' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChanged = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(<ClipLabelButtons clip={clip} onChanged={onChanged} />);
    });

    const button = Array.from(host.querySelectorAll('button')).find((entry) => entry.textContent === '진짜 낙상');
    await act(async () => {
      button?.click();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/clips/clip-1/label', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ label: 'TRUE_POSITIVE' }),
    }));
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ label: 'TRUE_POSITIVE' }));
    expect(host.textContent).toContain('진짜 낙상 라벨을 저장했습니다.');

    act(() => root.unmount());
    host.remove();
  });
});
