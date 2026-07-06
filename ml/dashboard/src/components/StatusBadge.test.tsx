import { describe, expect, it } from 'vitest';
import { getBackendStatus, getCameraStatusMeta } from './StatusBadge';
import type { SystemSnapshot } from '../api/client';

describe('status badge mapping', () => {
  it('maps camera status values to Korean labels', () => {
    expect(getCameraStatusMeta('online').label).toBe('온라인');
    expect(getCameraStatusMeta('offline').label).toBe('오프라인');
    expect(getCameraStatusMeta('starting').label).toBe('시작 중');
    expect(getCameraStatusMeta('unknown').label).toBe('확인 중');
  });

  it('maps backend system reachability to operator text', () => {
    const system: SystemSnapshot = {
      version: 'test',
      backend: {
        configured: true,
        reachable: false,
        last_ok_at: null,
      },
    };

    expect(getBackendStatus(system).label).toBe('백엔드 연결 실패');
  });
});
