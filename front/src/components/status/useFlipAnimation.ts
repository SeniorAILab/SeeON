import { useLayoutEffect, useRef, type RefObject } from "react";

const FLIP_DURATION_MS = 250;
const FLIP_EASING = "ease-out";
const FLIP_KEY_ATTR = "data-flip-key";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function toRect(el: HTMLElement): Rect {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * FLIP(First-Last-Invert-Play) 전환 훅. 레이아웃이 바뀌어도 transform/opacity만
 * 애니메이션한다 — width/height/grid-template 등 레이아웃 속성은 절대 전환하지 않는다.
 * `signature`가 바뀔 때마다(그리드 재배치 발생 시) 직전 렌더의 위치(First)와 이번
 * 렌더 후 새 위치(Last)를 비교해 역변환을 즉시 적용하고, 다음 프레임에 원상태로 전환한다.
 */
export function useFlipAnimation(containerRef: RefObject<HTMLElement | null>, signature: string): void {
  const previousRectsRef = useRef<Map<string, Rect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(container.querySelectorAll<HTMLElement>(`[${FLIP_KEY_ATTR}]`));
    const previousRects = previousRectsRef.current;
    const reduceMotion = prefersReducedMotion();

    if (!reduceMotion) {
      for (const el of items) {
        const key = el.getAttribute(FLIP_KEY_ATTR);
        if (!key) continue;
        const prev = previousRects.get(key);
        if (!prev) continue;
        const next = toRect(el);
        if (next.width === 0 || next.height === 0) continue;

        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        const sx = prev.width / next.width;
        const sy = prev.height / next.height;
        if (dx === 0 && dy === 0 && sx === 1 && sy === 1) continue;

        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        // 위 transform을 강제로 커밋시켜야 아래의 transition-back이 애니메이션된다.
        void el.offsetWidth;
        el.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
        el.style.transform = "none";

        const clearInlineStyle = () => {
          el.style.transition = "";
          el.style.transform = "";
          el.removeEventListener("transitionend", clearInlineStyle);
        };
        el.addEventListener("transitionend", clearInlineStyle);
      }
    }

    const nextRects = new Map<string, Rect>();
    for (const el of items) {
      const key = el.getAttribute(FLIP_KEY_ATTR);
      if (!key) continue;
      nextRects.set(key, toRect(el));
    }
    previousRectsRef.current = nextRects;
    // signature 변화가 곧 "레이아웃이 바뀌었다"는 트리거이므로 그것만 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
