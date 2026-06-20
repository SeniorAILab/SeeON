import { cn } from "@/lib/utils";
import { kakaoLabel } from "@/lib/labels";
import { MessageCircle, CheckCircle2, Clock, Send, AlertTriangle } from "lucide-react";
import type { KakaoAlertStatus } from "@/types";

const config: Record<
  KakaoAlertStatus,
  { chip: string; Icon: typeof MessageCircle } | null
> = {
  NONE: null,
  PENDING: { chip: "bg-status-cautionBg text-status-caution", Icon: Clock },
  SENDING: { chip: "bg-brand-soft text-brand", Icon: Send },
  SENT: { chip: "bg-brand-soft text-brand", Icon: MessageCircle },
  ACKNOWLEDGED: { chip: "bg-status-stableBg text-status-stable", Icon: CheckCircle2 },
  FAILED: { chip: "bg-status-dangerBg text-status-danger", Icon: AlertTriangle },
};

export function KakaoAlertStatusBadge({
  status,
  className,
}: {
  status: KakaoAlertStatus;
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
      title="카카오톡 알림 상태"
    >
      <Icon className="h-3 w-3" />
      {kakaoLabel[status]}
    </span>
  );
}
