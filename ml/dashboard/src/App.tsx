import { useEffect, useMemo, useState } from 'react';
import {
  deleteCamera,
  fetchCameras,
  fetchClips,
  fetchStatus,
  fetchSystem,
  type Camera,
  type CameraRegistry,
  type Clip,
  type SystemSnapshot,
} from './api/client';
import { AddCameraModal } from './components/AddCameraModal';
import { AuthGate } from './components/AuthGate';
import { CameraCard } from './components/CameraCard';
import { ClipLabelButtons, koreanClipLabel } from './components/ClipLabelButtons';
import { DetectionSettingsForm } from './components/DetectionSettingsForm';
import { getBackendStatus } from './components/StatusBadge';
import { extractEvents, extractHeartbeat } from './statusFeed';

const emptyRegistry: CameraRegistry = {
  registry_version: 0,
  cameras: [],
};

type ScreenId = 'home' | 'cameras' | 'events' | 'system' | 'settings';

const screens: Array<{ id: ScreenId; label: string }> = [
  { id: 'home', label: '홈' },
  { id: 'cameras', label: '카메라 관리' },
  { id: 'events', label: '이벤트' },
  { id: 'system', label: '시스템' },
  { id: 'settings', label: '탐지 설정' },
];

function formatTime(value: string | null): string {
  if (!value) {
    return '시간 정보 없음';
  }
  return new Date(value).toLocaleString('ko-KR');
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function StorageGauge({ system }: { system: SystemSnapshot | null }): JSX.Element {
  const used = system?.storage?.clips_used_bytes;
  const limit = system?.storage?.clips_limit_bytes;
  if (typeof used !== 'number' || typeof limit !== 'number' || limit <= 0) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-soft">
        <p className="text-sm font-black text-indigo-500">스토리지 게이지</p>
        <h3 className="mt-1 text-xl font-black text-slate-950">클립 스토어 사용량</h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          현재 /api/v1/system 응답에 클립 스토리지 사용량 필드가 없습니다. README에 system API 확장 제안을 기록했습니다.
        </p>
        <div className="mt-4 h-3 rounded-full bg-slate-100">
          <div className="h-3 w-1/3 rounded-full bg-slate-300" />
        </div>
      </div>
    );
  }
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="rounded-3xl bg-white p-5 shadow-soft">
      <p className="text-sm font-black text-indigo-500">스토리지 게이지</p>
      <h3 className="mt-1 text-xl font-black text-slate-950">클립 스토어 사용량</h3>
      <div className="mt-4 h-3 rounded-full bg-slate-100">
        <div className="h-3 rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm font-bold text-slate-600">{formatBytes(used)} / {formatBytes(limit)} · {percent}%</p>
    </div>
  );
}

function HistoryPanel({
  title,
  entries,
}: {
  title: string;
  entries?: SystemSnapshot['update_history'];
}): JSX.Element {
  return (
    <article className="rounded-3xl bg-white p-5 shadow-soft">
      <p className="text-sm font-black text-indigo-500">{title}</p>
      {entries && entries.length > 0 ? (
        <div className="mt-3 space-y-3">
          {entries.map((entry, index) => (
            <div key={entry.id ?? `${title}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-sm font-black text-slate-900">{entry.version ?? '버전 정보 없음'}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {entry.status ?? '상태 정보 없음'} · {formatTime(entry.created_at ?? null)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">제공된 이력 데이터가 없습니다. 배포 이력이 연결되면 이 영역에 표시됩니다.</p>
      )}
    </article>
  );
}

function Dashboard(): JSX.Element {
  const [screen, setScreen] = useState<ScreenId>('home');
  const [registry, setRegistry] = useState<CameraRegistry>(emptyRegistry);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<unknown>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [clipsError, setClipsError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;

    async function loadClips(): Promise<void> {
      try {
        const nextClips = await fetchClips();
        if (active) {
          setClips(nextClips);
          setClipsError(null);
        }
      } catch {
        if (active) {
          setClipsError('클립 목록을 불러오지 못했습니다.');
        }
      }
    }

    void loadClips();
    const timer = window.setInterval(loadClips, 8_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function upsertCamera(camera: Camera): void {
    setRegistry((current) => ({
      registry_version: current.registry_version + 1,
      cameras: [camera, ...current.cameras.filter((item) => item.id !== camera.id)],
    }));
  }

  function handleClipChanged(clip: Clip): void {
    setClips((current) => current.map((item) => (item.id === clip.id ? clip : item)));
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleteMessage(null);
    try {
      await deleteCamera(deleteTarget.id);
      setRegistry((current) => ({
        registry_version: current.registry_version + 1,
        cameras: current.cameras.filter((camera) => camera.id !== deleteTarget.id),
      }));
      setDeleteTarget(null);
    } catch {
      setDeleteMessage('카메라 삭제에 실패했습니다. 참조 중인 이벤트나 권한을 확인하세요.');
    }
  }

  const cameraPanel = (
    <section className="rounded-4xl bg-white/55 p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-indigo-500">Registry v{registry.registry_version}</p>
          <h2 className="text-2xl font-black text-slate-950">카메라 관리</h2>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700"
        >
          + 카메라 추가
        </button>
      </div>
      {cameraError ? <p className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{cameraError}</p> : null}
      {registry.cameras.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {registry.cameras.map((camera) => (
            <CameraCard key={camera.id} camera={camera} onUpdated={upsertCamera} onDelete={setDeleteTarget} />
          ))}
        </div>
      ) : (
        <div className="rounded-4xl border border-dashed border-indigo-200 bg-white p-8 text-center text-slate-500">
          등록된 카메라가 없습니다. 첫 RTSP 스트림을 추가하세요.
        </div>
      )}
    </section>
  );

  const eventPanel = (
    <section className="rounded-4xl bg-slate-950 p-5 text-white shadow-glow">
      <p className="text-sm font-black text-indigo-300">Live feed</p>
      <h2 className="mt-1 text-2xl font-black">이벤트</h2>
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
  );

  const clipPanel = (
    <section className="rounded-4xl bg-white/80 p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-indigo-500">GET /api/v1/clips</p>
          <h2 className="text-2xl font-black text-slate-950">클립 목록</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">{clips.length}개</span>
      </div>
      {clipsError ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{clipsError}</p> : null}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {clips.length > 0 ? clips.map((clip) => (
          <article key={clip.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <video src={clip.video_path} controls className="aspect-video w-full rounded-2xl bg-slate-950" />
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-indigo-500">{clip.camera_label}</p>
                <h3 className="font-black text-slate-950">{clip.event_type}</h3>
                <p className="mt-1 text-xs text-slate-400">{formatTime(clip.created_at)}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{koreanClipLabel(clip.label)}</span>
            </div>
            <div className="mt-4">
              <ClipLabelButtons clip={clip} onChanged={handleClipChanged} />
            </div>
          </article>
        )) : <p className="rounded-3xl bg-slate-50 p-6 text-sm font-bold text-slate-500">표시할 클립이 없습니다.</p>}
      </div>
    </section>
  );

  const systemPanel = (
    <section className="space-y-5">
      <div className="rounded-4xl bg-white/85 p-6 shadow-soft">
        <p className="text-sm font-black uppercase tracking-[0.24em] text-indigo-500">/api/v1/system</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">시스템</h2>
        {systemError ? <p className="mt-3 text-sm font-bold text-rose-600">{systemError}</p> : null}
        {system ? (
          <p className="mt-3 text-sm text-slate-500">API 버전 {system.version} · 마지막 백엔드 성공 {formatTime(system.backend.last_ok_at)}</p>
        ) : null}
        <span className={`mt-5 inline-flex rounded-full px-4 py-2 text-sm font-black ring-1 ${backendStatus.className}`}>{backendStatus.label}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <StorageGauge system={system} />
        <HistoryPanel title="업데이트 이력" entries={system?.update_history} />
        <HistoryPanel title="롤백 이력" entries={system?.rollback_history} />
      </div>
      <section className="rounded-4xl bg-white/80 p-5 shadow-soft">
        <p className="text-sm font-black text-indigo-500">시스템 알림 센터</p>
        <h3 className="mt-1 text-xl font-black text-slate-950">/api/v1/status ops 이벤트</h3>
        <div className="mt-4 space-y-3">
          {events.length > 0 ? events.map((event) => (
            <article key={`ops-${event.id}`} className="rounded-3xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-black text-slate-900">{event.title}</h4>
                <time className="text-xs font-bold text-slate-400">{formatTime(event.timestamp)}</time>
              </div>
              <p className="mt-2 text-sm text-slate-600">{event.detail}</p>
            </article>
          )) : <p className="rounded-3xl bg-slate-50 p-5 text-sm font-bold text-slate-500">현재 렌더링할 ops 이벤트가 없습니다.</p>}
        </div>
      </section>
    </section>
  );

  return (
    <main className="min-h-screen bg-[#eef2ff] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 p-5 lg:p-8">
        <aside className="hidden w-72 shrink-0 flex-col rounded-4xl bg-slate-950 p-7 text-white shadow-glow lg:flex">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 text-xl font-black">E</div>
          <h1 className="mt-8 text-3xl font-black leading-tight">엣지 카메라 대시보드</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">요양원 RTSP 레지스트리, 이벤트, 시스템, 탐지 설정을 운영합니다.</p>
          <nav className="mt-10 space-y-3 text-sm font-bold text-slate-300">
            {screens.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setScreen(entry.id)}
                className={`block w-full rounded-2xl px-4 py-3 text-left hover:bg-white/10 ${screen === entry.id ? 'bg-white/10 text-white' : ''}`}
              >
                {entry.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-3xl bg-white/10 p-4 text-xs leading-5 text-slate-300">
            같은 origin의 <span className="font-mono text-white">/api/v1</span>만 호출하고 Authorization 헤더에 메모리 토큰을 붙입니다.
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="rounded-4xl bg-white/85 p-6 shadow-soft backdrop-blur">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.24em] text-indigo-500">ML API /api/v1</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">{screens.find((entry) => entry.id === screen)?.label}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-4 py-2 text-sm font-black ring-1 ${backendStatus.className}`}>{backendStatus.label}</span>
                <button type="button" onClick={() => setModalOpen(true)} className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700">
                  + 카메라 추가
                </button>
              </div>
            </div>
          </header>

          <nav className="grid gap-2 rounded-3xl bg-white/60 p-2 shadow-sm lg:hidden sm:grid-cols-5">
            {screens.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setScreen(entry.id)} className={`rounded-2xl px-3 py-2 text-sm font-black ${screen === entry.id ? 'bg-slate-950 text-white' : 'text-slate-600'}`}>
                {entry.label}
              </button>
            ))}
          </nav>

          {screen === 'home' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">
              <div className="space-y-6">{cameraPanel}</div>
              <div className="space-y-6">{eventPanel}<StorageGauge system={system} /></div>
            </div>
          ) : null}
          {screen === 'cameras' ? cameraPanel : null}
          {screen === 'events' ? <div className="space-y-6">{eventPanel}{clipPanel}</div> : null}
          {screen === 'system' ? systemPanel : null}
          {screen === 'settings' ? <DetectionSettingsForm cameras={registry.cameras} /> : null}
        </section>
      </div>

      <AddCameraModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={upsertCamera} />

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-4xl bg-white p-6 shadow-glow">
            <p className="text-sm font-black text-rose-500">DELETE 확인</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">{deleteTarget.label} 삭제</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">카메라를 삭제하면 연결된 상태 갱신이 중단됩니다. 서버가 참조 중인 이벤트를 보호하면 삭제가 거절될 수 있습니다.</p>
            {deleteMessage ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700" role="status">{deleteMessage}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-600">취소</button>
              <button type="button" onClick={() => void confirmDelete()} className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-700">삭제</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function App(): JSX.Element {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
