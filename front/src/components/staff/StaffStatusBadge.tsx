import { cn } from "@/lib/utils";
import { statusWord } from "@/lib/staffCopy";
import { AlertTriangle, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import type { SpaceStatusLevel } from "@/types";

const cfg: Record<
  SpaceStatusLevel,
  { chip: string; Icon: typeof CheckCircle2 }
> = {
  STABLE: { chip: "bg-status-stableBg text-status-stable", Icon: CheckCircle2 },
  CAUTION: { chip: "bg-status-cautionBg text-status-caution", Icon: AlertCircle },
  DANGER: { chip: "bg-status-dangerBg text-status-danger", Icon: AlertTriangle },
  CHECK_NEEDED: { chip: "bg-status-checkBg text-status-check", Icon: HelpCircle },
};

/** 큰 상태 배지 — 색상 + 아이콘 + 한글 문구를 함께 사용(색약 대응) */
export function StaffStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: SpaceStatusLevel;
  size?: "md" | "lg";
  className?: string;
}) {
  const c = cfg[status];
  const { Icon } = c;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-bold",
        size === "lg" ? "px-4 py-2 text-staff-status" : "px-3 py-1.5 text-staff-body font-bold",
        c.chip,
        className
      )}
    >
      <Icon className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />
      {statusWord[status]}
    </span>
  );
}
