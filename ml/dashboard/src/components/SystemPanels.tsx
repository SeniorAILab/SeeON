import type { SystemSnapshot } from '../api/client';
import type { FeedEvent } from '../statusFeed';

type BackendStatusView = {
  label: string;
  className: string;
};

function formatTime(value: string | null): string {
  if (!value) return '시간 정보 없음';
  return new Date(value).toLocaleString('ko-KR');
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function StorageGauge({ system }: { system: SystemSnapshot | null }): JSX.Element {
  const clipStore = system?.storage?.clip_store;
  const usedPct = clipStore?.used_pct;
  const usedBytes = clipStore?.used_bytes;
  const totalBytes = clipStore?.total_bytes;
  if (typeof usedPct !== 'number' || !Number.isFinite(usedPct)) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-soft">
        <p className="text-sm font-black text-indigo-500">스토리지 게이지</p>
        <h3 className="mt-1 text-xl font-black text-slate-950">클립 스토어 사용량</h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          현재 /api/v1/system 응답에 storage.clip_store.used_pct 값이 없습니다. 스토리지 사용률이 연결되면 이 영역에 표시됩니다.
        </p>
        <div className="mt-4 h-3 rounded-full bg-slate-100">
          <div className="h-3 w-1/3 rounded-full bg-slate-300" />
        </div>
      </div>
    );
  }
  const percent = Math.max(0, Math.min(100, usedPct));
  const usageText =
    typeof usedBytes === 'number' && typeof totalBytes === 'number'
      ? `${formatBytes(usedBytes)} / ${formatBytes(totalBytes)} · ${percent.toFixed(1)}%`
      : `${percent.toFixed(1)}%`;
  return (
    <div className="rounded-3xl bg-white p-5 shadow-soft">
      <p className="text-sm font-black text-indigo-500">스토리지 게이지</p>
      <h3 className="mt-1 text-xl font-black text-slate-950">클립 스토어 사용량</h3>
      <div className="mt-4 h-3 rounded-full bg-slate-100" role="meter" aria-label="클립 스토어 사용률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-3 rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm font-bold text-slate-600">{usageText}</p>
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

export function SystemPanel({
  apiBase,
  system,
  systemError,
  backendStatus,
  events,
}: {
  apiBase: string;
  system: SystemSnapshot | null;
  systemError: string | null;
  backendStatus: BackendStatusView;
  events: FeedEvent[];
}): JSX.Element {
  return (
    <section className="space-y-5">
      <div className="rounded-4xl bg-white/85 p-6 shadow-soft">
        <p className="text-sm font-black tracking-[0.24em] text-indigo-500">{apiBase}/system</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">시스템</h2>
        {systemError ? <p className="mt-3 text-sm font-bold text-rose-600">{systemError}</p> : null}
        {system ? (
          <p className="mt-3 text-sm text-slate-500">API 버전 {system.version} · 마지막 백엔드 성공 {formatTime(system.backend.last_ok_at)}</p>
        ) : null}
        {system?.image_digests ? (
          <p className="mt-2 text-xs font-bold text-slate-500">
            ml-api digest {system.image_digests.ml_api ?? '미제공'} · ml-worker digest {system.image_digests.ml_worker ?? '미제공'}
          </p>
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
}
