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

  // TV를 상시 띄워두는 운영 형태라 화면 절전이 걸리면 알림을 아무도 못 본다.
  // Wake Lock을 잡아 화면이 꺼지지 않게 하고, 미지원 브라우저에서는 조용히
  // 무시한다(기능 자체를 막지는 않는다).
  useEffect(() => {
    const wakeLockApi = (
      navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
      }
    ).wakeLock;
    if (!wakeLockApi) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      wakeLockApi
        .request("screen")
        .then((lock) => {
          if (released) {
            void lock.release?.();
            return;
          }
          sentinel = lock;
        })
        .catch(() => {
          // 사용자 제스처 부족/정책 거부 등. 화면 유지는 부가 기능이라
          // 실패해도 현황판 동작을 막지 않는다.
        });
    };

    // 탭이 백그라운드로 갔다 오면 브라우저가 lock을 자동 해제한다.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release?.();
      sentinel = null;
    };
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
