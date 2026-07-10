import { FormEvent, useState } from 'react';
import { updateCameraDecodeBackend, updateCamera, type Camera, type DecodeBackend } from '../api/client';
import { StatusBadge } from './StatusBadge';

const DECODE_BACKEND_OPTIONS: Array<{ value: DecodeBackend; label: string }> = [
  { value: 'auto', label: '자동 (GPU→CPU)' },
  { value: 'nvdec', label: 'GPU (NVDEC)' },
  { value: 'cpu', label: 'CPU' },
];

function toDecodeBackendValue(value: Camera['decode_backend']): DecodeBackend {
  if (value === 'nvdec' || value === 'cpu' || value === 'opencv') {
    return value === 'opencv' ? 'cpu' : value;
  }
  return 'auto';
}

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
  const [decodeBackend, setDecodeBackend] = useState<DecodeBackend>(toDecodeBackendValue(camera.decode_backend));
  const [decodeBusy, setDecodeBusy] = useState(false);

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

  async function handleDecodeBackendChange(value: DecodeBackend): Promise<void> {
    setDecodeBackend(value);
    setMessage(null);
    setDecodeBusy(true);
    try {
      const updated = await updateCameraDecodeBackend(camera.id, value);
      onUpdated?.(updated, camera.id);
      setMessage('디코딩 백엔드를 변경했습니다.');
    } catch {
      setDecodeBackend(toDecodeBackendValue(camera.decode_backend));
      setMessage('디코딩 백엔드 변경에 실패했습니다.');
    } finally {
      setDecodeBusy(false);
    }
  }

  return (
    <article className="rounded-4xl border border-white/80 bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand">Camera</p>
          <h3 className="mt-2 text-xl font-black text-ink">{camera.label}</h3>
        </div>
        <StatusBadge status={camera.status} />
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="font-semibold text-ink-faint">RTSP</dt>
          <dd className="mt-1 break-words rounded-2xl bg-surface2 px-3 py-2 font-mono text-xs leading-5 text-ink-soft">{camera.rtsp_url_masked}</dd>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-brand-soft px-3 py-2">
          <dt className="font-semibold text-ink-soft">병실 매핑</dt>
          <dd className={mapped ? 'font-bold text-brand' : 'font-bold text-ink-faint'}>{mapped ? '서버 자동 관리' : '로컬 등록'}</dd>
        </div>
        <div className="rounded-2xl bg-surface2 px-3 py-2">
          <dt className="font-semibold text-ink-faint">디코딩 백엔드</dt>
          <dd className="mt-2">
            <label className="sr-only" htmlFor={`decode-backend-${camera.id}`}>디코딩 백엔드</label>
            <select
              id={`decode-backend-${camera.id}`}
              value={decodeBackend}
              disabled={decodeBusy}
              onChange={(event) => void handleDecodeBackendChange(event.target.value as DecodeBackend)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-ink outline-none ring-brand focus:ring-4 disabled:opacity-60"
            >
              {DECODE_BACKEND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </dd>
        </div>
      </dl>

      {editing ? (
        <form className="mt-5 space-y-3 rounded-3xl bg-surface2 p-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <label className="block text-sm font-bold text-ink-soft">
            이름
            <input name="label" value={label} onChange={(event) => setLabel(event.target.value)} className="mt-2 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-ink outline-none ring-brand focus:ring-4" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-60">{busy ? '저장 중...' : '저장'}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-full bg-surface px-4 py-2 text-xs font-black text-ink-soft shadow-sm">취소</button>
          </div>
        </form>
      ) : null}

      {message ? <p className="mt-4 text-xs font-bold text-brand" role="status">{message}</p> : null}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <p className="text-xs text-ink-faint">등록 {new Date(camera.created_at).toLocaleString('ko-KR')}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-full bg-brand-soft px-3 py-2 text-xs font-black text-brand hover:bg-brand-soft">
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
