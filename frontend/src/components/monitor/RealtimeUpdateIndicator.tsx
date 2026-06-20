import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

/** "3초 전 갱신" — 라이브 느낌을 위해 1초마다 상대시간 갱신 */
export function RealtimeUpdateIndicator({ lastUpdateAt }: { lastUpdateAt: string | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 text-lg text-ink-soft">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
      </span>
      {lastUpdateAt ? `${timeAgo(lastUpdateAt)} 갱신` : "갱신 대기"}
    </span>
  );
}
