import { describe, expect, it } from 'vitest';
import { normalizeCamera, normalizeClip } from './normalizers';

describe('normalizeClip video availability', () => {
  it('defaults video_available to true and video_error to null for legacy manifests', () => {
    const clip = normalizeClip({ id: 'cam-1-clip', event_type: 'fall' });
    expect(clip?.video_available).toBe(true);
    expect(clip?.video_error).toBeNull();
  });

  it('surfaces a diagnostic unplayable clip when video_available is false', () => {
    const clip = normalizeClip({
      clip_id: 'cam-1-clip',
      event_type: 'fall',
      video_available: false,
      video_error: 'encoder failed: h264_nvenc',
    });
    expect(clip?.video_available).toBe(false);
    expect(clip?.video_error).toBe('encoder failed: h264_nvenc');
  });
});

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
