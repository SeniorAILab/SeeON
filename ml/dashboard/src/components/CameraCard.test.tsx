import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CameraCard } from './CameraCard';
import type { Camera } from '../api/client';

const camera: Camera = {
  id: 'cam-1',
  label: '301호 침대 A',
  rtsp_url_masked: 'rtsp://user:****@camera.local/stream',
  space_id: 'space-301',
  backend_camera_id: null,
  status: 'online',
  created_at: '2026-07-06T00:00:00Z',
};

describe('CameraCard', () => {
  it('renders label, status badge, masked URL, and room mapping state', () => {
    const host = document.createElement('div');
    const root = createRoot(host);

    act(() => {
      root.render(<CameraCard camera={camera} />);
    });

    expect(host.textContent).toContain('301호 침대 A');
    expect(host.textContent).toContain('온라인');
    expect(host.textContent).toContain('rtsp://user:****@camera.local/stream');
    expect(host.textContent).toContain('연결됨');

    act(() => root.unmount());
  });
});
