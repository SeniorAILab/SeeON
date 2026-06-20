import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { eventTypeLabel } from "@/lib/labels";
import type { DetectionEvent, Level } from "@/types";

const dotColor: Record<Level, string> = {
  LOW: "bg-status-stable",
  MEDIUM: "bg-status-caution",
  HIGH: "bg-status-danger",
};

export function EventTimeline({ events }: { events: DetectionEvent[] }) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">기록된 이벤트가 없습니다.</p>;
  }
  return (
    <ol className="relative space-y-4 pl-1">
      {events.map((ev, i) => (
        <li key={ev.id} className="relative flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", dotColor[ev.riskLevel])} />
            {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
          </div>
          <div className="-mt-0.5 pb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-soft">
                {formatTime(ev.detectedAt)}
              </span>
              <span className="text-xs font-medium text-ink">
                {eventTypeLabel[ev.eventType]}
              </span>
              {ev.zoneName && (
                <span className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                  {ev.zoneName}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">{ev.message}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
