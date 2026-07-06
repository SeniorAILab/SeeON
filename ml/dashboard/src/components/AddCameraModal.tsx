import { FormEvent, useMemo, useState } from 'react';
import { createCamera, testCameraConnection, type Camera, type CameraTestResult } from '../api/client';

const RTSP_PATTERN = /^rtsps?:\/\/.+/i;

type AddCameraModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (camera: Camera) => void;
};

type WizardStep = 'rtsp' | 'test' | 'mapping';

function formatTestResult(result: CameraTestResult): string {
  if (result.ok) {
    const size = result.width && result.height ? ` · ${result.width}×${result.height}` : '';
    return `연결 테스트 성공${size}`;
  }

  const reason = result.error_class ? ` (${result.error_class})` : '';
  return `연결 테스트 실패${reason}`;
}

export function AddCameraModal({ open, onClose, onCreated }: AddCameraModalProps): JSX.Element | null {
  const [step, setStep] = useState<WizardStep>('rtsp');
  const [label, setLabel] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testPassed, setTestPassed] = useState(false);

  const rtspValidationError = useMemo(() => {
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

  function closeAndReset(): void {
    setStep('rtsp');
    setLabel('');
    setRtspUrl('');
    setSpaceId('');
    setMessage(null);
    setBusy(false);
    setTestPassed(false);
    onClose();
  }

  function handleRtspSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMessage(null);
    if (rtspValidationError) {
      setMessage(rtspValidationError);
      return;
    }
    setStep('test');
    setMessage('입력값이 준비되었습니다. 서버 연결 테스트를 실행하세요.');
  }

  async function handleTest(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await testCameraConnection({ label, rtsp_url: rtspUrl });
      setMessage(formatTestResult(result));
      setTestPassed(result.ok);
      if (result.ok) {
        setStep('mapping');
      }
    } catch {
      setTestPassed(false);
      setMessage('연결 테스트 요청에 실패했습니다. 사전 테스트 API 상태를 확인하세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (!spaceId.trim()) {
      setMessage('병실 매핑 space_id를 입력하세요.');
      return;
    }
    if (!testPassed) {
      setMessage('등록 전에 연결 테스트 성공이 필요합니다.');
      setStep('test');
      return;
    }

    setBusy(true);
    try {
      const camera = await createCamera({ label, rtsp_url: rtspUrl, space_id: spaceId });
      onCreated(camera);
      setMessage('카메라가 등록되었습니다.');
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
            <p className="text-sm font-bold text-indigo-500">새 스트림 마법사</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">카메라 추가</h2>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200"
          >
            닫기
          </button>
        </div>

        <ol className="mt-6 grid gap-2 text-xs font-black text-slate-500 sm:grid-cols-3">
          <li className={`rounded-2xl px-3 py-2 ${step === 'rtsp' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>1. RTSP 입력</li>
          <li className={`rounded-2xl px-3 py-2 ${step === 'test' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>2. 연결 테스트</li>
          <li className={`rounded-2xl px-3 py-2 ${step === 'mapping' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>3. 병실 매핑</li>
        </ol>

        {step === 'rtsp' ? (
          <form className="mt-6 space-y-4" onSubmit={handleRtspSubmit} noValidate>
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
            <button type="submit" className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700">
              연결 테스트 단계로
            </button>
          </form>
        ) : null}

        {step === 'test' ? (
          <div className="mt-6 rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-bold text-slate-600">{label}</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-500">{rtspUrl}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={busy}
                className="rounded-full bg-emerald-100 px-5 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? '테스트 중...' : '연결 테스트 실행'}
              </button>
              <button type="button" onClick={() => setStep('rtsp')} className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-600 shadow-sm">
                이전
              </button>
            </div>
          </div>
        ) : null}

        {step === 'mapping' ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleCreate(event)} noValidate>
            <label className="block text-sm font-bold text-slate-700">
              병실 매핑 space_id
              <input
                value={spaceId}
                onChange={(event) => setSpaceId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-indigo-200 focus:ring-4"
                placeholder="space-301"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={busy} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-soft hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? '등록 중...' : '카메라 등록'}
              </button>
              <button type="button" onClick={() => setStep('test')} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-600">
                이전
              </button>
            </div>
          </form>
        ) : null}

        {message ? (
          <p className="mt-5 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
