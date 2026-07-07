import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCamera, testCamera } from '../api/client';
import { AddCameraModal } from './AddCameraModal';

vi.mock('../api/client', () => ({
  createCamera: vi.fn(),
  testCamera: vi.fn(),
}));

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

function renderModal(): { readonly host: HTMLDivElement; readonly root: ReturnType<typeof createRoot> } {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<AddCameraModal open onClose={vi.fn()} onCreated={vi.fn()} />);
  });
  return { host, root };
}

beforeEach(() => {
  vi.mocked(createCamera).mockReset();
  vi.mocked(testCamera).mockReset();
  vi.mocked(createCamera).mockResolvedValue({
    id: 'server-issued-camera-id',
    label: '301호 침대 A',
    rtsp_url_masked: 'rtsp://operator:***@10.0.0.5:8554/live',
    space_id: null,
    backend_camera_id: null,
    status: 'offline',
    created_at: '2026-07-07T00:00:00.000Z',
  });
  vi.mocked(testCamera).mockResolvedValue({ ok: false, error_class: 'timeout' });
});

describe('AddCameraModal', () => {
  it('blocks submission and explains required camera label validation', () => {
    const { host, root } = renderModal();

    const submitButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '카메라 등록');

    act(() => {
      submitButton?.click();
    });

    expect(host.textContent).toContain('카메라 이름을 입력하세요.');

    act(() => root.unmount());
    host.remove();
  });

  it('creates a camera from name and structured RTSP fields without asking for a camera id or space_id', async () => {
    const { host, root } = renderModal();

    expect(host.textContent).not.toContain('space_id');
    expect(host.textContent).not.toContain('카메라 ID');

    setInput(host, 'label', '301호 침대 A');
    setInput(host, 'rtspHost', '10.0.0.5');
    setInput(host, 'rtspPort', '8554');
    setInput(host, 'rtspPath', '/live');
    setInput(host, 'rtspUsername', 'operator');
    setInput(host, 'rtspPassword', 'secret');
    setInput(host, 'rtspQuery', 'profile=main');

    expect(host.textContent).toContain('rtsp://operator:***@10.0.0.5:8554/live?profile=main');

    const submitButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '카메라 등록');
    await act(async () => {
      submitButton?.click();
    });

    expect(createCamera).toHaveBeenCalledWith({
      label: '301호 침대 A',
      rtsp_url: 'rtsp://operator:secret@10.0.0.5:8554/live?profile=main',
    });
    expect(testCamera).toHaveBeenCalledWith('server-issued-camera-id');

    act(() => root.unmount());
    host.remove();
  });
});
