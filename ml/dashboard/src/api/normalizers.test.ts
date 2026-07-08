import { describe, expect, it } from 'vitest';
import { normalizeCamera } from './normalizers';

describe('rtsp url redaction via normalizeCamera', () => {
  it('masks host and credentials for an rtsp url with credentials', () => {
    const camera = normalizeCamera({
      id: 'cam-1',
      rtsp_url: 'rtsp://operator:hunter2@camera.internal.example:554/stream',
    });

    expect(camera).not.toBeNull();
    const masked = camera!.rtsp_url_masked;
    expect(masked).toContain('redacted-camera');
    expect(masked).toContain('***');
    expect(masked).not.toContain('camera.internal.example');
    expect(masked).not.toContain('hunter2');
  });

  it('still redacts the host for an rtsp url without credentials', () => {
    const camera = normalizeCamera({
      id: 'cam-2',
      rtsp_url: 'rtsp://camera.internal.example:554/stream',
    });

    expect(camera).not.toBeNull();
    const masked = camera!.rtsp_url_masked;
    expect(masked).toContain('redacted-camera');
    expect(masked).not.toContain('camera.internal.example');
  });

  it('falls back to the Korean placeholder for an unparseable rtsp url', () => {
    const camera = normalizeCamera({
      id: 'cam-3',
      rtsp_url: 'not a valid rtsp url garbage',
    });

    expect(camera).not.toBeNull();
    expect(camera!.rtsp_url_masked).toBe('RTSP URL 비공개');
  });

  it('falls back to the Korean placeholder for an opaque-path rtsp url instead of leaking credentials', () => {
    const camera = normalizeCamera({
      id: 'cam-4',
      rtsp_url: 'rtsp:user:secret@camera.internal.example/live',
    });

    expect(camera).not.toBeNull();
    const masked = camera!.rtsp_url_masked;
    expect(masked).toBe('RTSP URL 비공개');
    expect(masked).not.toContain('secret');
    expect(masked).not.toContain('camera.internal.example');
  });
});
