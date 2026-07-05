import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/types";

const cfg: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  NORMAL: { label: "정상 연결", dot: "bg-status-stable", text: "text-status-stable" },
  RECONNECTING: { label: "재연결 중", dot: "bg-status-caution animate-pulse", text: "text-status-caution" },
  DELAYED: { label: "데이터 지연", dot: "bg-status-caution", text: "text-status-caution" },
  DISCONNECTED: { label: "연결 끊김", dot: "bg-status-danger animate-pulse", text: "text-status-danger" },
};

export function ConnectionStatusBadge({ state }: { state: ConnectionState }) {
  const c = cfg[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-lg font-semibold", c.text)}>
      <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}
