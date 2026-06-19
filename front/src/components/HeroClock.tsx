"use client";

import { useEffect, useState } from "react";

// ponytail: renders nothing until mounted so SSR/client markup match (no
// hydration warning); the clock is purely presentational.
export function HeroClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // ponytail: client-only clock; sync set avoids a 1s "--:--" flash on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now
    ? now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "--:--";
  const date = now
    ? now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })
    : "";

  return (
    <div className="text-right">
      <div className="text-3xl font-bold tabular-nums sm:text-4xl">{time}</div>
      <div className="mt-1 text-sm text-white/85">{date}</div>
      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
        <span className="size-1.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,.3)]" />
        실시간 감지 작동 중
      </div>
    </div>
  );
}
