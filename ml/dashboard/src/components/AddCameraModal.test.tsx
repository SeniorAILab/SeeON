import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AddCameraModal } from './AddCameraModal';

describe('AddCameraModal', () => {
  it('blocks submission and explains required camera label validation', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(<AddCameraModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    });

    const submitButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '카메라 등록');

    act(() => {
      submitButton?.click();
    });

    expect(host.textContent).toContain('카메라 이름을 입력하세요.');

    act(() => root.unmount());
    host.remove();
  });
});
