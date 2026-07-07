import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRelayToken, getRelayToken } from '../api/client';
import { AuthGate } from './AuthGate';

afterEach(() => {
  clearRelayToken();
  vi.restoreAllMocks();
});

describe('AuthGate', () => {
  it('keeps protected content hidden until a memory relay token is submitted', () => {
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(<AuthGate><div>보호된 홈</div></AuthGate>);
    });

    expect(host.textContent).toContain('릴레이 토큰 입력');
    expect(host.textContent).not.toContain('보호된 홈');

    const input = host.querySelector('input');
    act(() => {
      if (input) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, 'relay-token-1');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const button = Array.from(host.querySelectorAll('button')).find((entry) => entry.textContent === '보호 화면 열기');
    act(() => {
      button?.click();
    });

    expect(host.textContent).toContain('보호된 홈');
    expect(getRelayToken()).toBe('relay-token-1');
    expect(setItemSpy).not.toHaveBeenCalled();

    act(() => root.unmount());
    host.remove();
  });
});
