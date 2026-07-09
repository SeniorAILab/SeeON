import { useDarkMode } from '../useDarkMode';

export type ScreenId = 'home' | 'cameras' | 'events' | 'system' | 'settings';

type BackendStatusView = {
  label: string;
  className: string;
};

const screens: Array<{ id: ScreenId; label: string }> = [
  { id: 'home', label: '홈' },
  { id: 'cameras', label: '카메라 관리' },
  { id: 'events', label: '이벤트' },
  { id: 'system', label: '시스템' },
  { id: 'settings', label: '탐지 설정' },
];

export function getScreenLabel(screen: ScreenId): string {
  return screens.find((entry) => entry.id === screen)?.label ?? screen;
}

export function DashboardShell({
  apiBase,
  backendStatus,
  screen,
  onScreenChange,
  onAddCamera,
  children,
}: {
  apiBase: string;
  backendStatus: BackendStatusView;
  screen: ScreenId;
  onScreenChange: (screen: ScreenId) => void;
  onAddCamera: () => void;
  children: JSX.Element;
}): JSX.Element {
  const { dark, toggle } = useDarkMode();
  return (
    <main className="min-h-screen bg-[#eef2ff] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 p-5 lg:p-8">
        <aside className="hidden w-72 shrink-0 flex-col rounded-4xl bg-slate-950 p-7 text-white shadow-glow lg:flex">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 text-xl font-black">E</div>
          <h1 className="mt-8 break-keep text-2xl font-black leading-snug">엣지 카메라 대시보드</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">요양원 RTSP 레지스트리, 이벤트, 시스템, 탐지 설정을 운영합니다.</p>
          <nav className="mt-10 space-y-3 text-sm font-bold text-slate-300">
            {screens.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onScreenChange(entry.id)}
                className={`block w-full rounded-2xl px-4 py-3 text-left hover:bg-white/10 ${screen === entry.id ? 'bg-white/10 text-white' : ''}`}
              >
                {entry.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-3xl bg-white/10 p-4 text-xs leading-5 text-slate-300">
            같은 origin의 <span className="font-mono text-white">{apiBase}</span>만 호출하고 Authorization 헤더에 메모리 토큰을 붙입니다.
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="rounded-4xl bg-white/85 p-6 shadow-soft backdrop-blur">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black tracking-[0.24em] text-indigo-500">ML API {apiBase}</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">{getScreenLabel(screen)}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-4 py-2 text-sm font-black ring-1 ${backendStatus.className}`}>{backendStatus.label}</span>
                <button
                  type="button"
                  onClick={toggle}
                  aria-pressed={dark}
                  aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
                  className="rounded-full border border-border bg-surface px-4 py-3 text-sm font-black text-ink shadow-soft hover:bg-surface2"
                >
                  {dark ? '☀️ 라이트' : '🌙 다크'}
                </button>
                <button type="button" onClick={onAddCamera} className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700">
                  + 카메라 추가
                </button>
              </div>
            </div>
          </header>

          <nav className="grid gap-2 rounded-3xl bg-white/60 p-2 shadow-sm lg:hidden sm:grid-cols-5">
            {screens.map((entry) => (
              <button key={entry.id} type="button" onClick={() => onScreenChange(entry.id)} className={`rounded-2xl px-3 py-2 text-sm font-black ${screen === entry.id ? 'bg-slate-950 text-white' : 'text-slate-600'}`}>
                {entry.label}
              </button>
            ))}
          </nav>

          {children}
        </section>
      </div>
    </main>
  );
}
