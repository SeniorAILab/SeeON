import { cn } from "@/lib/utils";

/** 클립 타임라인: 감지 10초 전 / 감지 시점 / 감지 10초 후 + 현재 재생 위치 */
export function EventClipTimeline({
  currentSec,
  durationSec,
  detectionSec,
  onSeek,
}: {
  currentSec: number;
  durationSec: number;
  detectionSec: number;
  onSeek?: (sec: number) => void;
}) {
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / durationSec) * 100))}%`;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.round(ratio * durationSec));
  }

  return (
    <div className="select-none">
      <div
        className="relative h-3 cursor-pointer rounded-full bg-border"
        onClick={handleClick}
      >
        {/* 진행 채움 */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-brand"
          style={{ width: pct(currentSec) }}
        />
        {/* 감지 시점 마커 */}
        <div
          className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-status-danger"
          style={{ left: pct(detectionSec) }}
          title="감지 시점"
        />
        {/* 재생 헤드 */}
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow"
          style={{ left: pct(currentSec) }}
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] font-medium text-ink-faint">
        <span>감지 10초 전</span>
        <span className={cn("text-status-danger")}>감지 시점</span>
        <span>감지 10초 후</span>
      </div>
    </div>
  );
}
