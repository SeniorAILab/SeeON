import { FormEvent, useMemo, useState } from 'react';
import { createCamera, testCamera, type Camera, type CameraTestResult } from '../api/client';

const RTSP_PATTERN = /^rtsps?:\/\/.+/i;

type AddCameraModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (camera: Camera) => void;
};

function formatTestResult(result: CameraTestResult): string {
  if (result.ok) {
    const size = result.width && result.height ? ` · ${result.width}×${result.height}` : '';
    return `연결 테스트 성공${size}`;
  }

  const reason = result.error_class ? ` (${result.error_class})` : '';
  return `연결 테스트 실패${reason}`;
}

export function AddCameraModal({ open, onClose, onCreated }: AddCameraModalProps): JSX.Element | null {
  const [label, setLabel] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [createdCamera, setCreatedCamera] = useState<Camera | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const validationError = useMemo(() => {
    if (!label.trim()) {
      return '카메라 이름을 입력하세요.';
    }
    if (!RTSP_PATTERN.test(rtspUrl.trim())) {
      return 'RTSP URL은 rtsp:// 또는 rtsps://로 시작해야 합니다.';
    }
    return null;
  }, [label, rtspUrl]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);

    if (validationError) {
      setMessage(validationError);
      return;
    }

    setBusy(true);
    try {
      const camera = await createCamera({ label, rtsp_url: rtspUrl, space_id: spaceId });
      setCreatedCamera(camera);
      setMessage('카메라가 등록되었습니다. 연결 테스트를 실행할 수 있습니다.');
      onCreated(camera);
    } catch {
      setMessage('카메라 등록에 실패했습니다. 입력값과 API 상태를 확인하세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTest(): Promise<void> {
    if (!createdCamera) {
      return;
    }

    setTesting(true);
    try {
      const result = await testCamera(createdCamera.id);
      setMessage(formatTestResult(result));
    } catch {
      setMessage('연결 테스트 요청에 실패했습니다.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-4xl bg-white p-6 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-indigo-500">새 스트림</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">카메라 추가</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200"
          >
            닫기
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block text-sm font-bold text-slate-700">
            카메라 이름
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4"
              placeholder="예: 301호 침대 A"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            RTSP URL
            <input
              value={rtspUrl}
              onChange={(event) => setRtspUrl(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none ring-indigo-200 focus:ring-4"
              placeholder="rtsp://user:password@camera.local/stream"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            병실 ID (선택)
            <input
              value={spaceId}
              onChange={(event) => setSpaceId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4"
              placeholder="space-301"
            />
          </label>

          {message ? (
            <p className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700" role="status">
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            {createdCamera ? (
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="rounded-full bg-emerald-100 px-5 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testing ? '테스트 중...' : 'POST /test 실행'}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? '등록 중...' : '카메라 등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
