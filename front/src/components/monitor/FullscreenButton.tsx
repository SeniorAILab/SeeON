import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

/** 대상 엘리먼트를 브라우저 전체화면으로 — ESC 로 해제 가능 */
export function FullscreenButton({ targetRef }: { targetRef: React.RefObject<HTMLElement> }) {
  const [isFull, setIsFull] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setError(null);
      } else {
        await targetRef.current?.requestFullscreen();
        setError(null);
      }
    } catch {
      setError("전체 화면을 사용할 수 없습니다");
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={toggle}
        className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-lg font-semibold text-ink-soft hover:bg-surface2"
      >
        {isFull ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        {isFull ? "전체 화면 해제" : "전체 화면"}
      </button>
      {error && <span className="text-sm font-semibold text-ink-soft">{error}</span>}
    </div>
  );
}
