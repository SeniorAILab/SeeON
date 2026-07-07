import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { upsertCameraInRegistry } from './App';
import type { Camera, CameraRegistry, SystemSnapshot } from './api/client';
import { StorageGauge } from './components/SystemPanels';

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
