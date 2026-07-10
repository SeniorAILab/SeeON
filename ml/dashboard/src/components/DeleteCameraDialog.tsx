import type { Camera } from '../api/client';

export function DeleteCameraDialog({
  camera,
  message,
  onCancel,
  onConfirm,
}: {
  camera: Camera;
  message: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-4xl bg-surface p-6 shadow-glow">
        <p className="text-sm font-black text-rose-500">DELETE 확인</p>
        <h2 className="mt-2 text-2xl font-black text-ink">{camera.label} 삭제</h2>
        <p className="mt-3 text-sm leading-6 text-ink-soft">카메라를 삭제하면 연결된 상태 갱신이 중단됩니다. 서버가 참조 중인 이벤트를 보호하면 삭제가 거절될 수 있습니다.</p>
        {message ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700" role="status">{message}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-full bg-surface2 px-5 py-3 text-sm font-black text-ink-soft">취소</button>
          <button type="button" onClick={onConfirm} className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-700">삭제</button>
        </div>
      </div>
    </div>
  );
}
