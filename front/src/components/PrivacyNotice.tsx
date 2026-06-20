import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Privacy First 안내 — 얼굴 인식을 사용하지 않음을 명시.
 * AI 는 "어느 공간/구역에서 어떤 행동인지"만 분석하고, "그 사람이 누구인지"는 알지 못한다.
 * 개인 매핑(202호 침대A → 김○○)은 요양원 DB(ResidentAssignment)에서만 관리된다.
 */
export function PrivacyNotice({
  variant = "line",
  className,
}: {
  variant?: "line" | "badge";
  className?: string;
}) {
  if (variant === "badge") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-status-stable/30 bg-status-stableBg px-2.5 py-1 text-xs font-semibold text-status-stable",
          className
        )}
        title="얼굴 인식을 사용하지 않습니다"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        얼굴 인식 미사용
      </span>
    );
  }
  return (
    <p
      className={cn(
        "flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint",
        className
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      얼굴 인식을 사용하지 않습니다 · 공간·구역 단위의 안전 상태만 분석합니다.
    </p>
  );
}
