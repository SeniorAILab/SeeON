import { cn } from "@/lib/utils";
import { statusWord } from "@/lib/staffCopy";
import { AlertTriangle, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import type { SpaceStatusLevel } from "@/types";

const cfg: Record<SpaceStatusLevel, { chip: string; Icon: typeof CheckCircle2 }> = {
  STABLE: { chip: "bg-status-stableBg text-status-stable", Icon: CheckCircle2 },
  CAUTION: { chip: "bg-status-cautionBg text-status-caution", Icon: AlertCircle },
  DANGER: { chip: "bg-status-dangerBg text-status-danger", Icon: AlertTriangle },
  CHECK_NEEDED: { chip: "bg-status-checkBg text-status-check", Icon: HelpCircle },
};

/** 대형 모니터용 상태 배지 — 멀리서도 보이게 크게 */
export function LargeRiskBadge({
  status,
  size = "lg",
  className,
}: {
  status: SpaceStatusLevel;
  size?: "md" | "lg";
  className?: string;
}) {
  const c = cfg[status];
  const { Icon } = c;
  const lg = size === "lg";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl font-extrabold",
        lg ? "px-4 py-1.5 text-3xl 2xl:text-4xl" : "px-2.5 py-1 text-xl",
        c.chip,
        className
      )}
    >
      <Icon className={lg ? "h-8 w-8 2xl:h-10 2xl:w-10" : "h-5 w-5"} />
      {statusWord[status]}
    </span>
  );
}
