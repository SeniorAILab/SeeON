import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

/** 대상 엘리먼트를 브라우저 전체화면으로 — ESC 로 해제 가능 */
export function FullscreenButton({ targetRef }: { targetRef: React.RefObject<HTMLElement> }) {
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await targetRef.current?.requestFullscreen();
      }
    } catch {
      /* 일부 환경에서 막힐 수 있음 */
    }
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-base font-semibold text-ink-soft hover:bg-surface2"
    >
      {isFull ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
      {isFull ? "전체 화면 해제" : "전체 화면"}
    </button>
  );
}
