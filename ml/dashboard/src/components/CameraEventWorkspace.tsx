import { useEffect, useMemo, useState } from 'react';
import { getCameraStreamUrl, type Camera, type Clip } from '../api/client';
import type { FeedEvent } from '../statusFeed';
import { ClipLabelButtons, koreanClipLabel } from './ClipLabelButtons';
import { buildEventOptions, eventLabel, filterClipsForCameraEvent, filterEventsForCamera, formatEventTime } from './cameraEventLogic';
import { EventLivePanel } from './EventLivePanel';

export { CameraEventLivePanel } from './CameraEventLivePanel';
export { buildEventOptions, filterClipsForCameraEvent } from './cameraEventLogic';

export function CameraEventWorkspace({
  cameras,
  events,
  clips,
  heartbeat,
  statusError,
  clipsError,
  onClipChanged,
  selectedCameraId,
  onSelectedCameraChange,
}: {
  cameras: Camera[];
  events: FeedEvent[];
  clips: Clip[];
  heartbeat: string;
  statusError: string | null;
  clipsError: string | null;
  onClipChanged: (clip: Clip) => void;
  selectedCameraId?: string | null;
  onSelectedCameraChange?: (cameraId: string | null) => void;
}): JSX.Element {
  const [internalCameraId, setInternalCameraId] = useState<string | null>(cameras[0]?.id ?? null);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const activeCameraId = selectedCameraId !== undefined ? selectedCameraId : internalCameraId;
  const selectedCamera = cameras.find((camera) => camera.id === activeCameraId) ?? cameras[0] ?? null;
  const selectedCameraEvents = useMemo(() => filterEventsForCamera(selectedCamera, events), [selectedCamera, events]);
  const eventOptions = useMemo(() => buildEventOptions(selectedCamera, selectedCameraEvents, clips), [selectedCamera, selectedCameraEvents, clips]);
  const activeEventType =
    selectedEventType && eventOptions.some((option) => option.type === selectedEventType)
      ? selectedEventType
      : eventOptions[0]?.type ?? null;
  const selectedEventClips = filterClipsForCameraEvent(selectedCamera, clips, activeEventType);
  const streamUrl = selectedCamera && activeEventType ? getCameraStreamUrl(selectedCamera.id) : null;

  useEffect(() => {
    if (activeCameraId && cameras.some((camera) => camera.id === activeCameraId)) return;
    const nextCameraId = cameras[0]?.id ?? null;
    setInternalCameraId(nextCameraId);
    if (selectedCameraId !== undefined) onSelectedCameraChange?.(nextCameraId);
  }, [activeCameraId, cameras, onSelectedCameraChange, selectedCameraId]);

  useEffect(() => {
    setStreamError(null);
  }, [streamUrl]);

  function selectCamera(cameraId: string): void {
    setInternalCameraId(cameraId);
    onSelectedCameraChange?.(cameraId);
    setSelectedEventType(null);
    setStreamError(null);
  }

  return (
    <section className="rounded-4xl bg-slate-950 p-5 text-white shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-indigo-300">Live feed</p>
          <h2 className="mt-1 text-2xl font-black">카메라별 이벤트</h2>
        </div>
        <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black text-slate-300">{selectedCamera ? selectedCamera.label : '카메라 없음'}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="camera-grid">
        {cameras.length > 0 ? cameras.map((camera) => (
          <button
            key={camera.id}
            type="button"
            onClick={() => selectCamera(camera.id)}
            data-testid={`camera-tile-${camera.id}`}
            className={`min-h-24 rounded-3xl border px-4 py-3 text-left transition ${selectedCamera?.id === camera.id ? 'border-emerald-300 bg-white text-slate-950' : 'border-white/10 bg-white/10 text-white hover:bg-white/15'}`}
          >
            <span className="block text-xs font-black uppercase tracking-[0.18em] opacity-60">Camera</span>
            <span className="mt-2 block text-base font-black">{camera.label}</span>
            <span className="mt-2 block text-xs font-bold opacity-70">{camera.status}</span>
          </button>
        )) : (
          <p className="rounded-3xl bg-white/10 p-5 text-sm font-bold text-slate-300">등록된 카메라가 없습니다.</p>
        )}
      </div>
      <EventLivePanel
        selectedCamera={selectedCamera}
        eventOptions={eventOptions}
        selectedEventType={activeEventType}
        onSelectEvent={(eventType) => {
          setSelectedEventType(eventType);
          setStreamError(null);
        }}
        streamUrl={streamUrl}
        streamError={streamError}
        onStreamLoad={() => setStreamError(null)}
        onStreamError={() => setStreamError('라이브 스트림을 사용할 수 없습니다. worker 연결 또는 카메라 프레임 상태를 확인하세요.')}
      />
      <div className="mt-5 rounded-3xl bg-white/10 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Heartbeat</p>
        <p className="mt-2 text-sm font-bold text-white">{heartbeat}</p>
      </div>
      {statusError ? <p className="mt-4 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-100">{statusError}</p> : null}
      {clipsError ? <p className="mt-4 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-100">{clipsError}</p> : null}
      <section className="mt-5 rounded-3xl bg-white p-4 text-slate-900" data-testid="clip-history">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-black">클립 이력</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{selectedEventClips.length}개</span>
        </div>
        {selectedEventClips.length > 0 ? (
          <div className="mt-3 space-y-3">
            {selectedEventClips.map((clip) => (
              <article key={clip.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <video src={clip.video_path} controls className="aspect-video w-full rounded-2xl bg-slate-950" />
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{eventLabel(clip.event_type)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{clip.camera_label} · {formatEventTime(clip.created_at)}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{koreanClipLabel(clip.label)}</span>
                </div>
                <div className="mt-3">
                  <ClipLabelButtons clip={clip} onChanged={onClipChanged} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 break-keep rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">선택 이벤트의 증거 클립이 없습니다.</p>
        )}
      </section>
    </section>
  );
}
