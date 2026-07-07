import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BedExitLivePanel, StorageGauge, upsertCameraInRegistry } from './App';
import type { Camera, CameraRegistry, SystemSnapshot } from './api/client';

const system: SystemSnapshot = {
  version: 'edge-1.2.3',
  image_digests: { ml_api: 'sha256:api', ml_worker: 'sha256:worker' },
  backend: { configured: true, reachable: true, last_ok_at: '2026-07-07T00:00:00.000Z' },
  storage: { clip_store: { total_bytes: 2000, used_bytes: 500, used_pct: 25 } },
};

describe('StorageGauge', () => {
  it('renders the clip_store used_pct from /api/v1/system', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(<StorageGauge system={system} />);
    });

    const meter = host.querySelector('[role="meter"]');
    const fill = meter?.querySelector('div');
    expect(meter?.getAttribute('aria-valuenow')).toBe('25');
    expect(fill).toHaveProperty('style.width', '25%');
    expect(host.textContent).toContain('25.0%');

    act(() => root.unmount());
    host.remove();
  });
});

describe('upsertCameraInRegistry', () => {
  it('replaces a provisional camera when ml-api returns a canonical id for the same backend camera', () => {
    const provisional: Camera = {
      id: 'local-provisional-id',
      label: '301호 침대 A',
      rtsp_url_masked: 'rtsp://***:***@camera.local/stream',
      space_id: null,
      backend_camera_id: 'backend-camera-1',
      status: 'offline',
      created_at: '2026-07-06T00:00:00Z',
    };
    const returned: Camera = {
      ...provisional,
      id: 'backend-camera-1',
      label: '301호 침대 A 수정',
    };
    const registry: CameraRegistry = {
      registry_version: 1,
      cameras: [provisional],
    };

    const next = upsertCameraInRegistry(registry, returned, 'local-provisional-id');

    expect(next.registry_version).toBe(2);
    expect(next.cameras).toEqual([returned]);
  });
});

describe('BedExitLivePanel', () => {
  it('renders a bed-exit overlay video when the clip list has bed-exit evidence', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <BedExitLivePanel
          events={[{ id: 'event-1', cameraLabel: '301호', title: 'bed-exit', detail: '침대 밖 이동', timestamp: null }]}
          clips={[{
            id: 'clip-1',
            camera_id: 'cam-1',
            camera_label: '301호',
            event_type: 'bed-exit',
            created_at: null,
            label: null,
            video_path: '/api/v1/clips/clip-1/video',
          }]}
        />,
      );
    });

    const video = host.querySelector('video');
    expect(host.textContent).toContain('침대 이탈 실시간 상태');
    expect(video?.getAttribute('src')).toBe('/api/v1/clips/clip-1/video');

    act(() => root.unmount());
    host.remove();
  });

  it('does not mark unrelated bed text as a bed-exit signal', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <BedExitLivePanel
          events={[{ id: 'event-2', cameraLabel: '301호', title: '침대 주변 움직임 증가', detail: '낙상 아님', timestamp: null }]}
          clips={[]}
        />,
      );
    });

    expect(host.textContent).toContain('대기 중');
    expect(host.textContent).not.toContain('감지 신호 있음');
    expect(host.querySelector('video')).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});
