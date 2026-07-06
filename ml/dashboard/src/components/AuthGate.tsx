import { FormEvent, useState } from 'react';
import { clearRelayToken, setRelayToken } from '../api/client';

type AuthGateProps = {
  children: JSX.Element;
};

export function AuthGate({ children }: AuthGateProps): JSX.Element {
  const [token, setToken] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState('릴레이 토큰을 입력하면 보호 화면이 열립니다. 토큰은 브라우저 메모리에만 보관됩니다.');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextToken = token.trim();
    if (!nextToken) {
      clearRelayToken();
      setAuthorized(false);
      setMessage('릴레이 토큰이 없어 보호된 대시보드를 열 수 없습니다.');
      return;
    }
    setRelayToken(nextToken);
    setAuthorized(true);
    setMessage('');
  }

  function handleLogout(): void {
    clearRelayToken();
    setToken('');
    setAuthorized(false);
    setMessage('세션 토큰을 메모리에서 지웠습니다.');
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
            토큰 지우기
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
              서버 계정 API가 아직 없으므로 로컬 계정 화면은 릴레이 토큰 입력으로 대체합니다.
            </p>
            <p className="mt-6 rounded-3xl bg-white/10 p-4 text-xs leading-5 text-slate-300">
              토큰은 localStorage나 sessionStorage에 저장하지 않고 현재 탭 메모리에만 유지합니다.
            </p>
          </aside>
          <form className="p-8" onSubmit={handleSubmit} noValidate>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-indigo-500">Protected login</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">릴레이 토큰 입력</h2>
            <label className="mt-8 block text-sm font-bold text-slate-700">
              Authorization Bearer 토큰
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none ring-indigo-200 focus:ring-4"
                placeholder="relay token"
                autoComplete="off"
              />
            </label>
            <p className="mt-4 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700" role="status">
              {message}
            </p>
            <button
              type="submit"
              className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700"
            >
              보호 화면 열기
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
