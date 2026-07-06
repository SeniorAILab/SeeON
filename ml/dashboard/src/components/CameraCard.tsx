import type { Camera } from '../api/client';
import { StatusBadge } from './StatusBadge';

type CameraCardProps = {
  camera: Camera;
};

export function CameraCard({ camera }: CameraCardProps): JSX.Element {
  const mapped = Boolean(camera.space_id || camera.backend_camera_id);

  return (
    <article className="rounded-4xl border border-white/80 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-400">Camera</p>
          <h3 className="mt-2 text-xl font-black text-slate-900">{camera.label}</h3>
        </div>
        <StatusBadge status={camera.status} />
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="font-semibold text-slate-400">RTSP</dt>
          <dd className="mt-1 break-all rounded-2xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
            {camera.rtsp_url_masked}
          </dd>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-indigo-50 px-3 py-2">
          <dt className="font-semibold text-slate-600">병실 매핑</dt>
          <dd className={mapped ? 'font-bold text-indigo-700' : 'font-bold text-slate-400'}>
            {mapped ? '연결됨' : '미연결'}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-slate-400">등록 {new Date(camera.created_at).toLocaleString('ko-KR')}</p>
    </article>
  );
}
