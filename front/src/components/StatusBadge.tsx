import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/labels";
import type { SpaceStatusLevel } from "@/types";

const styles: Record<SpaceStatusLevel, { dot: string; chip: string }> = {
  STABLE: { dot: "bg-status-stable", chip: "bg-status-stableBg text-status-stable" },
  CAUTION: { dot: "bg-status-caution", chip: "bg-status-cautionBg text-status-caution" },
  DANGER: { dot: "bg-status-danger", chip: "bg-status-dangerBg text-status-danger" },
  CHECK_NEEDED: { dot: "bg-status-check", chip: "bg-status-checkBg text-status-check" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: SpaceStatusLevel;
  className?: string;
}) {
  const s = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        s.chip,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {statusLabel[status]}
    </span>
  );
}
