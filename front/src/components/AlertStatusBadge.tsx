import { cn } from "@/lib/utils";
import { alertLabel } from "@/lib/labels";
import { MessageCircle, CheckCircle2, Clock, Send, AlertTriangle } from "lucide-react";
import type { AlertLifecycleStatus } from "@/types";

const config: Record<
  AlertLifecycleStatus,
  { chip: string; Icon: typeof MessageCircle } | null
> = {
  NONE: null,
  PENDING: { chip: "bg-status-cautionBg text-status-caution", Icon: Clock },
  SENDING: { chip: "bg-brand-soft text-brand", Icon: Send },
  SENT: { chip: "bg-brand-soft text-brand", Icon: MessageCircle },
  ACKNOWLEDGED: { chip: "bg-status-stableBg text-status-stable", Icon: CheckCircle2 },
  FAILED: { chip: "bg-status-dangerBg text-status-danger", Icon: AlertTriangle },
};

export function AlertStatusBadge({
  status,
  className,
}: {
  status: AlertLifecycleStatus;
  className?: string;
}) {
  const c = config[status];
  if (!c) return null;
  const { Icon } = c;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        c.chip,
        className
      )}
      title="알림 상태"
    >
      <Icon className="h-3 w-3" />
      {alertLabel[status]}
    </span>
  );
}
