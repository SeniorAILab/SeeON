import type { Camera, CameraRegistry } from '../api/client';
import { CameraCard } from './CameraCard';

export function CameraManagementPanel({
  registry,
  cameraError,
  onAddCamera,
  onUpdated,
  onDelete,
}: {
  registry: CameraRegistry;
  cameraError: string | null;
  onAddCamera: () => void;
  onUpdated: (camera: Camera, previousCameraId?: string) => void;
  onDelete: (camera: Camera) => void;
}): JSX.Element {
  return (
    <section className="rounded-4xl bg-surface/55 p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-brand">Registry v{registry.registry_version}</p>
          <h2 className="text-2xl font-black text-ink">카메라 관리</h2>
        </div>
        <button
          type="button"
          onClick={onAddCamera}
          className="rounded-full bg-brand px-5 py-3 text-sm font-black text-white shadow-soft hover:bg-brand"
        >
          + 카메라 추가
        </button>
      </div>
      {cameraError ? <p className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{cameraError}</p> : null}
      {registry.cameras.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {registry.cameras.map((camera) => (
            <CameraCard key={camera.id} camera={camera} onUpdated={onUpdated} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className="rounded-4xl border border-dashed border-brand bg-surface p-8 text-center text-ink-soft">
          등록된 카메라가 없습니다. 첫 RTSP 스트림을 추가하세요.
        </div>
      )}
    </section>
  );
}
