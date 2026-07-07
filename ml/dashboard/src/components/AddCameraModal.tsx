import { FormEvent, useMemo, useState } from 'react';
import { createCamera, testCamera, type Camera, type CameraTestResult } from '../api/client';

type AddCameraModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (camera: Camera) => void;
};

type RtspForm = {
  scheme: 'rtsp' | 'rtsps';
  host: string;
  port: string;
  path: string;
  username: string;
  password: string;
  query: string;
};

const initialRtspForm: RtspForm = {
  scheme: 'rtsp',
  host: '',
  port: '554',
  path: '/trackID=1',
  username: '',
  password: '',
  query: '',
};

function formatTestResult(result: CameraTestResult): string {
  if (result.ok) {
    const size = result.width && result.height ? ` · ${result.width}×${result.height}` : '';
    return `연결 테스트 성공${size}`;
  }

  const reason = result.error_class ? ` (${result.error_class})` : '';
  return `연결 테스트 실패${reason}`;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '/trackID=1';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizeQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
}

function buildRtspUrl(form: RtspForm): string {
  const username = form.username.trim();
  const password = form.password;
  const auth = username ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@` : '';
  const port = form.port.trim();
  const query = normalizeQuery(form.query);
  return `${form.scheme}://${auth}${form.host.trim()}${port ? `:${port}` : ''}${normalizePath(form.path)}${query ? `?${query}` : ''}`;
}

function maskRtspPreview(rtspUrl: string): string {
  return rtspUrl.replace(/(rtsp[s]?:\/\/)([^:@/?#]+):([^@/?#]+)@/i, '$1$2:***@');
}

export function AddCameraModal({ open, onClose, onCreated }: AddCameraModalProps): JSX.Element | null {
  const [label, setLabel] = useState('');
  const [rtspForm, setRtspForm] = useState<RtspForm>(initialRtspForm);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rtspUrl = useMemo(() => buildRtspUrl(rtspForm), [rtspForm]);
  const rtspPreview = useMemo(() => maskRtspPreview(rtspUrl), [rtspUrl]);
  const validationError = useMemo(() => {
    if (!label.trim()) {
      return '카메라 이름을 입력하세요.';
    }
    if (!rtspForm.host.trim()) {
      return '카메라 IP 또는 호스트를 입력하세요.';
    }
    const port = Number(rtspForm.port.trim());
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return 'RTSP 포트는 1부터 65535 사이의 숫자여야 합니다.';
    }
    return null;
  }, [label, rtspForm.host, rtspForm.port]);

  if (!open) {
    return null;
  }

  function closeAndReset(): void {
    setLabel('');
    setRtspForm(initialRtspForm);
    setMessage(null);
    setBusy(false);
    onClose();
  }

  function updateRtspField(field: keyof RtspForm, value: string): void {
    setRtspForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setBusy(true);
    try {
      const camera = await createCamera({ label: label.trim(), rtsp_url: rtspUrl });
      const result = await testCamera(camera.id);
      onCreated(camera);
      setMessage(`카메라가 등록되었습니다. ${formatTestResult(result)}`);
      closeAndReset();
    } catch {
      setMessage('카메라 등록에 실패했습니다. 입력값과 API 상태를 확인하세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-4xl bg-white p-6 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-indigo-500">새 스트림</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">카메라 추가</h2>
          </div>
          <button type="button" onClick={closeAndReset} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">
            닫기
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleCreate(event)} noValidate>
          <label className="block text-sm font-bold text-slate-700">
            카메라 이름
            <input
              name="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4"
              placeholder="예: 301호 침대 A"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)_120px]">
            <label className="block text-sm font-bold text-slate-700">
              방식
              <select
                name="rtspScheme"
                value={rtspForm.scheme}
                onChange={(event) => updateRtspField('scheme', event.target.value === 'rtsps' ? 'rtsps' : 'rtsp')}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4"
              >
                <option value="rtsp">rtsp</option>
                <option value="rtsps">rtsps</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              카메라 IP/호스트
              <input
                name="rtspHost"
                value={rtspForm.host}
                onChange={(event) => updateRtspField('host', event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4"
                placeholder="10.0.0.5"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              포트
              <input
                name="rtspPort"
                inputMode="numeric"
                value={rtspForm.port}
                onChange={(event) => updateRtspField('port', event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700">
              RTSP 아이디
              <input name="rtspUsername" value={rtspForm.username} onChange={(event) => updateRtspField('username', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4" />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              RTSP 비밀번호
              <input name="rtspPassword" type="password" value={rtspForm.password} onChange={(event) => updateRtspField('password', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700">
              경로
              <input name="rtspPath" value={rtspForm.path} onChange={(event) => updateRtspField('path', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4" placeholder="/trackID=1" />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              추가 인자
              <input name="rtspQuery" value={rtspForm.query} onChange={(event) => updateRtspField('query', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4" placeholder="profile=main" />
            </label>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">RTSP 미리보기</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-600">{rtspPreview}</p>
          </div>

          <button type="submit" disabled={busy} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? '등록 중...' : '카메라 등록'}
          </button>
        </form>

        {message ? (
          <p className="mt-5 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
