import { useEffect, useMemo, useState } from 'react';
import { fetchCameras, fetchStatus, fetchSystem, type Camera, type CameraRegistry, type SystemSnapshot } from './api/client';
import { AddCameraModal } from './components/AddCameraModal';
import { CameraCard } from './components/CameraCard';
import { getBackendStatus } from './components/StatusBadge';
import { extractEvents, extractHeartbeat } from './statusFeed';

const emptyRegistry: CameraRegistry = {
  registry_version: 0,
  cameras: [],
};

function formatTime(value: string | null): string {
  if (!value) {
    return '시간 정보 없음';
  }
  return new Date(value).toLocaleString('ko-KR');
}

export default function App(): JSX.Element {
  const [registry, setRegistry] = useState<CameraRegistry>(emptyRegistry);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<unknown>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const backendStatus = getBackendStatus(system);
  const events = useMemo(() => extractEvents(statusSnapshot), [statusSnapshot]);
  const heartbeat = useMemo(() => extractHeartbeat(statusSnapshot), [statusSnapshot]);

  useEffect(() => {
    let active = true;

    async function loadCameras(): Promise<void> {
      try {
        const nextRegistry = await fetchCameras();
        if (active) {
          setRegistry(nextRegistry);
          setCameraError(null);
        }
      } catch {
        if (active) {
          setCameraError('카메라 목록을 불러오지 못했습니다.');
        }
      }
    }

    void loadCameras();
    const timer = window.setInterval(loadCameras, 5_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadStatus(): Promise<void> {
      try {
        const snapshot = await fetchStatus();
        if (active) {
          setStatusSnapshot(snapshot);
          setStatusError(null);
        }
      } catch {
        if (active) {
          setStatusError('실시간 상태를 불러오지 못했습니다.');
        }
      }
    }

    void loadStatus();
    const timer = window.setInterval(loadStatus, 3_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSystem(): Promise<void> {
      try {
        const snapshot = await fetchSystem();
        if (active) {
          setSystem(snapshot);
          setSystemError(null);
        }
      } catch {
        if (active) {
          setSystemError('시스템 상태를 불러오지 못했습니다.');
        }
      }
    }

    void loadSystem();
    const timer = window.setInterval(loadSystem, 10_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function handleCreated(camera: Camera): void {
    setRegistry((current) => ({
      registry_version: current.registry_version + 1,
      cameras: [camera, ...current.cameras.filter((item) => item.id !== camera.id)],
    }));
  }

  return (
    <main className="min-h-screen bg-[#eef2ff] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 p-5 lg:p-8">
        <aside className="hidden w-72 shrink-0 flex-col rounded-4xl bg-slate-950 p-7 text-white shadow-glow lg:flex">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 text-xl font-black">E</div>
          <h1 className="mt-8 text-3xl font-black leading-tight">엣지 카메라 대시보드</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">요양원 RTSP 레지스트리와 실시간 상태를 한 화면에서 확인합니다.</p>
          <nav className="mt-10 space-y-3 text-sm font-bold text-slate-300">
            <a className="block rounded-2xl bg-white/10 px-4 py-3 text-white" href="#cameras">카메라 상태</a>
            <a className="block rounded-2xl px-4 py-3 hover:bg-white/10" href="#events">이벤트 피드</a>
            <a className="block rounded-2xl px-4 py-3 hover:bg-white/10" href="#system">시스템</a>
          </nav>
          <div className="mt-auto rounded-3xl bg-white/10 p-4 text-xs leading-5 text-slate-300">
            같은 origin의 <span className="font-mono text-white">/api/v1</span>만 호출합니다.
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="rounded-4xl bg-white/85 p-6 shadow-soft backdrop-blur">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.24em] text-indigo-500">ML API /api/v1</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">카메라 운영 현황</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3" id="system">
                <span className={`rounded-full px-4 py-2 text-sm font-black ring-1 ${backendStatus.className}`}>
                  {backendStatus.label}
                </span>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700"
                >
                  + 카메라 추가
                </button>
              </div>
            </div>
            {systemError ? <p className="mt-3 text-sm font-bold text-rose-600">{systemError}</p> : null}
            {system ? (
              <p className="mt-3 text-sm text-slate-500">
                API 버전 {system.version} · 마지막 백엔드 성공 {formatTime(system.backend.last_ok_at)}
              </p>
            ) : null}
          </header>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.8fr)]">
            <section id="cameras" className="rounded-4xl bg-white/55 p-5 shadow-soft">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-indigo-500">Registry v{registry.registry_version}</p>
                  <h2 className="text-2xl font-black text-slate-950">카메라 상태 카드</h2>
                </div>
                <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-600 shadow-sm">
                  {registry.cameras.length}대
                </span>
              </div>
              {cameraError ? <p className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{cameraError}</p> : null}
              {registry.cameras.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {registry.cameras.map((camera) => (
                    <CameraCard key={camera.id} camera={camera} />
                  ))}
                </div>
              ) : (
                <div className="rounded-4xl border border-dashed border-indigo-200 bg-white p-8 text-center text-slate-500">
                  등록된 카메라가 없습니다. 첫 RTSP 스트림을 추가하세요.
                </div>
              )}
            </section>

            <section id="events" className="rounded-4xl bg-slate-950 p-5 text-white shadow-glow">
              <p className="text-sm font-black text-indigo-300">Live feed</p>
              <h2 className="mt-1 text-2xl font-black">실시간 이벤트 피드</h2>
              <div className="mt-5 rounded-3xl bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Heartbeat</p>
                <p className="mt-2 text-sm font-bold text-white">{heartbeat}</p>
              </div>
              {statusError ? <p className="mt-4 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-100">{statusError}</p> : null}
              <div className="mt-5 space-y-3">
                {events.length > 0 ? (
                  events.map((event) => (
                    <article key={event.id} className="rounded-3xl bg-white p-4 text-slate-900">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-indigo-500">{event.cameraLabel}</p>
                          <h3 className="mt-1 font-black">{event.title}</h3>
                        </div>
                        <time className="text-right text-xs font-bold text-slate-400">{formatTime(event.timestamp)}</time>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{event.detail}</p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-3xl bg-white/10 p-5 text-sm font-bold text-slate-300">최근 이벤트가 없습니다.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>

      <AddCameraModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </main>
  );
}
