import { cn } from "@/lib/utils";
import { levelLabel } from "@/lib/labels";
import type { Level } from "@/types";

const styles: Record<Level, string> = {
  LOW: "bg-status-stableBg text-status-stable",
  MEDIUM: "bg-status-cautionBg text-status-caution",
  HIGH: "bg-status-dangerBg text-status-danger",
};

/** 낙상 위험도 배지 */
export function RiskBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        styles[level],
        className
      )}
    >
      낙상 {levelLabel[level]}
    </span>
  );
}
