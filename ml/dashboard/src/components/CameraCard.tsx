import { FormEvent, useState } from 'react';
import { updateCamera, type Camera } from '../api/client';
import { StatusBadge } from './StatusBadge';

type CameraCardProps = {
  camera: Camera;
  onUpdated?: (camera: Camera, previousCameraId: string) => void;
  onDelete?: (camera: Camera) => void;
};

export function CameraCard({ camera, onUpdated, onDelete }: CameraCardProps): JSX.Element {
  const mapped = Boolean(camera.space_id || camera.backend_camera_id);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(camera.label);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (!label.trim()) {
      setMessage('카메라 이름을 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateCamera(camera.id, {
        label: label.trim(),
      });
      onUpdated?.(updated, camera.id);
      setEditing(false);
      setMessage('카메라 정보를 수정했습니다.');
    } catch {
      setMessage('카메라 수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

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
          <dd className="mt-1 break-words rounded-2xl bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-600">{camera.rtsp_url_masked}</dd>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-indigo-50 px-3 py-2">
          <dt className="font-semibold text-slate-600">병실 매핑</dt>
          <dd className={mapped ? 'font-bold text-indigo-700' : 'font-bold text-slate-400'}>{mapped ? '서버 자동 관리' : '로컬 등록'}</dd>
        </div>
      </dl>

      {editing ? (
        <form className="mt-5 space-y-3 rounded-3xl bg-slate-50 p-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <label className="block text-sm font-bold text-slate-700">
            이름
            <input name="label" value={label} onChange={(event) => setLabel(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-60">{busy ? '저장 중...' : '저장'}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-600 shadow-sm">취소</button>
          </div>
        </form>
      ) : null}

      {message ? <p className="mt-4 text-xs font-bold text-indigo-600" role="status">{message}</p> : null}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <p className="text-xs text-slate-400">등록 {new Date(camera.created_at).toLocaleString('ko-KR')}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100">
            수정
          </button>
          <button type="button" onClick={() => onDelete?.(camera)} className="rounded-full bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100">
            삭제
          </button>
        </div>
      </div>
    </article>
  );
}
