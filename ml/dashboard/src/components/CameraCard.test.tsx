import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateCamera } from '../api/client';
import { CameraCard } from './CameraCard';
import type { Camera } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    updateCamera: vi.fn(),
  };
});

const camera: Camera = {
  id: 'cam-1',
  label: '301호 침대 A',
  rtsp_url_masked: 'rtsp://user:****@camera.local/stream',
  space_id: 'space-301',
  backend_camera_id: null,
  status: 'online',
  created_at: '2026-07-06T00:00:00Z',
};

function setInput(host: HTMLElement, name: string, value: string): void {
  const input = host.querySelector(`input[name="${name}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`missing input ${name}`);
  }
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.mocked(updateCamera).mockReset();
  vi.mocked(updateCamera).mockResolvedValue({ ...camera, label: '301호 침대 B' });
});

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
    expect(host.textContent).toContain('서버 자동 관리');

    act(() => root.unmount());
  });

  it('edits the camera name without exposing or requiring raw space_id', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onUpdated = vi.fn();

    act(() => {
      root.render(<CameraCard camera={camera} onUpdated={onUpdated} />);
    });

    const editButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '수정');
    act(() => {
      editButton?.click();
    });

    expect(host.textContent).not.toContain('space_id');

    setInput(host, 'label', '301호 침대 B');
    const saveButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '저장');
    await act(async () => {
      saveButton?.click();
    });

    expect(updateCamera).toHaveBeenCalledWith('cam-1', { label: '301호 침대 B' });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'cam-1', label: '301호 침대 B' }), 'cam-1');

    act(() => root.unmount());
    host.remove();
  });
});
