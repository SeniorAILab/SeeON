import type { Camera } from '../api/client';
import type { EventOption } from './cameraEventLogic';

export function EventLivePanel({
  selectedCamera,
  eventOptions,
  selectedEventType,
  onSelectEvent,
  streamUrl,
  streamError,
  onStreamLoad,
  onStreamError,
}: {
  selectedCamera: Camera | null;
  eventOptions: EventOption[];
  selectedEventType: string | null;
  onSelectEvent: (eventType: string) => void;
  streamUrl: string | null;
  streamError: string | null;
  onStreamLoad: () => void;
  onStreamError: () => void;
}): JSX.Element {
  const selectedOption = eventOptions.find((option) => option.type === selectedEventType) ?? null;
  const streamSelected = Boolean(selectedCamera && selectedOption && streamUrl);

  return (
    <section className="mt-5 rounded-3xl bg-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">Worker MJPEG</p>
          <h3 className="mt-1 text-lg font-black text-white">{selectedOption ? `${selectedOption.label} 실시간 상태 스트림` : '이벤트 실시간 상태 스트림'}</h3>
        </div>
        <span className={`rounded-full px-3 py-2 text-xs font-black ${streamError ? 'bg-rose-300 text-ink' : 'bg-emerald-300 text-ink'}`}>
          {streamError ? '사용 불가' : 'ml-api stream'}
        </span>
      </div>

      {eventOptions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="event-selector">
          {eventOptions.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => onSelectEvent(option.type)}
              data-testid={`event-row-${option.type}`}
              className={`rounded-full px-4 py-2 text-xs font-black ${selectedEventType === option.type ? 'bg-surface text-ink' : 'bg-white/10 text-slate-200 hover:bg-white/20'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {streamSelected && !streamError ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
          <img
            key={`${selectedCamera?.id}:${selectedOption?.type}:${streamUrl}`}
            src={streamUrl ?? ''}
            alt={`${selectedCamera?.label ?? '카메라'} ${selectedOption?.label ?? '이벤트'} 실시간 오버레이`}
            data-testid="live-mjpeg-stream"
            className="aspect-video w-full object-contain"
            onLoad={onStreamLoad}
            onError={onStreamError}
          />
        </div>
      ) : (
        <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-4 text-center text-sm font-bold text-slate-300" data-testid={streamSelected ? 'stream-unavailable' : 'stream-empty'}>
          {streamSelected ? '라이브 스트림을 사용할 수 없습니다. worker 프레임이 도착하지 않았습니다.' : '카메라와 이벤트를 선택하면 worker MJPEG 스트림을 연결합니다.'}
        </div>
      )}
      {streamError ? (
        <p className="mt-3 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-100" data-testid="stream-error">
          {streamError}
        </p>
      ) : null}
      <p className="mt-3 text-sm font-bold text-slate-200">{selectedCamera ? `${selectedCamera.label} · ${selectedOption?.label ?? '이벤트 선택 필요'}` : '등록된 카메라가 없습니다.'}</p>
    </section>
  );
}
