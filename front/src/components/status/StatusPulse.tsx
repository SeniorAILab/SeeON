/**
 * 상태 펄스 이펙트 모듈 — 같은 이펙트를 색상(tone)만 바꿔 재사용한다.
 * 시각 요소는 두 겹:
 *  1) pulseClassFor: 타일 자체의 box-shadow 호흡 (index.css `status-pulse` 키프레임의 색/퍼짐/속도 파라미터화)
 *  2) StatusPulseRing: 바깥으로 번지는 확산 링 (같은 ping 키프레임, 위험은 빠르게 / 안전은 느리게)
 * 새 tone 추가 시 두 Record에 한 줄씩만 추가하면 된다.
 */
export type PulseTone = "danger" | "safe";

const PULSE_CLASS: Record<PulseTone, string> = {
  danger: "animate-pulse-danger motion-reduce:animate-none",
  safe: "animate-pulse-safe motion-reduce:animate-none",
};

export function pulseClassFor(tone: PulseTone | null): string {
  return tone ? PULSE_CLASS[tone] : "";
}

const RING_CLASS: Record<PulseTone, string> = {
  danger: "border-status-danger opacity-45 animate-ping",
  safe: "border-status-stable opacity-35 animate-[ping_3.2s_cubic-bezier(0,0,0.2,1)_infinite]",
};

export function StatusPulseRing({ tone }: { tone: PulseTone }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-2xl border-2 motion-reduce:hidden ${RING_CLASS[tone]}`}
    />
  );
}
