import { Check } from "lucide-react";

/** 확인 완료 버튼 — 누르면 확대/오버레이가 평상시로 복귀하고 TTS 가 멈춘다. */
export function AcknowledgementButton({
  onAck,
  size = "md",
}: {
  onAck: () => void;
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <button
      onClick={onAck}
      className={
        "inline-flex items-center justify-center gap-2 rounded-2xl bg-status-stable font-extrabold text-white transition-transform active:scale-95 " +
        (lg ? "min-h-[72px] px-10 text-3xl" : "min-h-[56px] px-7 text-2xl")
      }
    >
      <Check className={lg ? "h-8 w-8" : "h-7 w-7"} />
      확인 완료
    </button>
  );
}
