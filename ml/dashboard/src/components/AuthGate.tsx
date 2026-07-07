import { FormEvent, useState } from 'react';
import { clearRelayToken, getConfiguredRelayToken, setRelayToken } from '../api/client';

const LOCAL_LOGIN_ID = 'admin';
const LOCAL_PASSWORD = 'admin';

type AuthGateProps = {
  children: JSX.Element;
};

export function AuthGate({ children }: AuthGateProps): JSX.Element {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState('로컬 대시보드는 admin/admin으로 로그인합니다.');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (loginId.trim() !== LOCAL_LOGIN_ID || password !== LOCAL_PASSWORD) {
      clearRelayToken();
      setAuthorized(false);
      setMessage('아이디 또는 비밀번호가 올바르지 않습니다.');
      return;
    }
    setRelayToken(getConfiguredRelayToken());
    setAuthorized(true);
    setMessage('');
  }

  function handleLogout(): void {
    clearRelayToken();
    setLoginId('');
    setPassword('');
    setAuthorized(false);
    setMessage('로그아웃했습니다.');
  }

  if (authorized) {
    return (
      <div>
        <div className="fixed right-5 top-5 z-40">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-soft hover:bg-slate-800"
          >
            로그아웃
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef2ff] p-5 text-slate-900">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-4xl bg-white shadow-glow lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="bg-slate-950 p-8 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 text-xl font-black">E</div>
            <h1 className="mt-8 text-3xl font-black leading-tight">엣지 카메라 대시보드</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              로컬 운영 화면은 단순 관리자 계정으로 보호합니다.
            </p>
            <p className="mt-6 rounded-3xl bg-white/10 p-4 text-xs leading-5 text-slate-300">
              로그인 상태와 API 토큰은 localStorage나 sessionStorage에 저장하지 않습니다.
            </p>
          </aside>
          <form className="p-8" onSubmit={handleSubmit} noValidate>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-indigo-500">Protected login</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">관리자 로그인</h2>
            <label className="mt-8 block text-sm font-bold text-slate-700">
              아이디
              <input
                name="loginId"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none ring-indigo-200 focus:ring-4"
                placeholder="admin"
                autoComplete="username"
              />
            </label>
            <label className="mt-4 block text-sm font-bold text-slate-700">
              비밀번호
              <input
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none ring-indigo-200 focus:ring-4"
                placeholder="admin"
                autoComplete="current-password"
              />
            </label>
            <p className="mt-4 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700" role="status">
              {message}
            </p>
            <button
              type="submit"
              className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700"
            >
              로그인
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
