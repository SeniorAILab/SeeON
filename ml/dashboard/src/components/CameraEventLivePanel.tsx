import { useEffect, useState } from 'react';
import type { Camera, Clip } from '../api/client';
import type { FeedEvent } from '../statusFeed';
import { eventLabel, filterClipsForCameraEvent, formatEventTime, normalizeEventTypeName } from './cameraEventLogic';
import { EventLivePanel } from './EventLivePanel';

export function CameraEventLivePanel({
  selectedCamera,
  selectedEvent,
  clips,
  streamUrl,
}: {
  selectedCamera: Camera | null;
  selectedEvent: FeedEvent | null;
  clips: Clip[];
  streamUrl: string | null;
}): JSX.Element {
  const [streamError, setStreamError] = useState<string | null>(null);
  const selectedEventType = selectedEvent ? normalizeEventTypeName(selectedEvent.eventType || selectedEvent.title) : null;
  const eventOptions = selectedEvent
    ? [{
        type: selectedEventType ?? 'event',
        label: eventLabel(selectedEvent.eventType || selectedEvent.title),
        latestTimestamp: selectedEvent.timestamp,
        recentCount: selectedEvent.timestamp ? 1 : 0,
      }]
    : [];
  const evidenceClips = filterClipsForCameraEvent(selectedCamera, clips, selectedEventType);

  useEffect(() => {
    setStreamError(null);
  }, [streamUrl, selectedEventType]);

  return (
    <div className="space-y-4">
      <EventLivePanel
        selectedCamera={selectedCamera}
        eventOptions={eventOptions}
        selectedEventType={selectedEventType}
        onSelectEvent={() => undefined}
        streamUrl={streamUrl}
        streamError={streamError}
        onStreamLoad={() => setStreamError(null)}
        onStreamError={() => setStreamError('라이브 스트림을 사용할 수 없습니다. worker 연결 또는 카메라 프레임 상태를 확인하세요.')}
      />
      <section className="rounded-3xl bg-surface p-4 text-ink">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-black">클립 이력</h3>
          <span className="rounded-full bg-surface2 px-3 py-1 text-xs font-black text-ink-soft">{evidenceClips.length}개</span>
        </div>
        {evidenceClips.length > 0 ? (
          <div className="mt-3 space-y-2">
            {evidenceClips.map((clip) => (
              <article key={clip.id} className="rounded-2xl bg-surface2 px-4 py-3">
                <p className="text-sm font-black text-ink">{eventLabel(clip.event_type)}</p>
                <p className="mt-1 text-xs font-bold text-ink-soft">{clip.camera_label} · {formatEventTime(clip.created_at)}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 break-keep rounded-2xl bg-surface2 p-4 text-sm font-bold text-ink-soft">선택 이벤트의 증거 클립이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
