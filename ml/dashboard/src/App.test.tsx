import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { StorageGauge } from './App';
import type { SystemSnapshot } from './api/client';

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
