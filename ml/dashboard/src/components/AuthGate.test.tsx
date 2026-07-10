import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRelayToken, fetchCameras, getConfiguredRelayToken, getRelayToken } from '../api/client';
import { AuthGate } from './AuthGate';

afterEach(() => {
  clearRelayToken();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('AuthGate', () => {
  it('opens protected content with the local admin/admin account and configured relay token', async () => {
    const configuredToken = 'configured-relay-token';
    vi.stubEnv('VITE_ML_API_RELAY_TOKEN', configuredToken);
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cameras: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(<AuthGate><div>보호된 홈</div></AuthGate>);
    });

    expect(host.textContent).toContain('관리자 로그인');
    expect(host.textContent).not.toContain('보호된 홈');

    const loginInput = host.querySelector('input[name="loginId"]');
    const passwordInput = host.querySelector('input[name="password"]');
    act(() => {
      if (loginInput instanceof HTMLInputElement && passwordInput instanceof HTMLInputElement) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(loginInput, 'admin');
        loginInput.dispatchEvent(new Event('input', { bubbles: true }));
        valueSetter?.call(passwordInput, 'admin');
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const button = Array.from(host.querySelectorAll('button')).find((entry) => entry.textContent === '로그인');
    act(() => {
      button?.click();
    });

    expect(host.textContent).toContain('보호된 홈');
    expect(getConfiguredRelayToken()).toBe(configuredToken);
    expect(getRelayToken()).toBe(configuredToken);
    expect(setItemSpy).not.toHaveBeenCalled();

    await fetchCameras();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/cameras', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${configuredToken}` }),
    }));

    act(() => root.unmount());
    host.remove();
  });

  it('rejects a wrong local admin password', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(<AuthGate><div>보호된 홈</div></AuthGate>);
    });

    const loginInput = host.querySelector('input[name="loginId"]');
    const passwordInput = host.querySelector('input[name="password"]');
    act(() => {
      if (loginInput instanceof HTMLInputElement && passwordInput instanceof HTMLInputElement) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(loginInput, 'admin');
        loginInput.dispatchEvent(new Event('input', { bubbles: true }));
        valueSetter?.call(passwordInput, 'wrong');
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const button = Array.from(host.querySelectorAll('button')).find((entry) => entry.textContent === '로그인');
    act(() => {
      button?.click();
    });

    expect(host.textContent).not.toContain('보호된 홈');
    expect(host.textContent).toContain('아이디 또는 비밀번호가 올바르지 않습니다.');
    expect(getRelayToken()).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});
