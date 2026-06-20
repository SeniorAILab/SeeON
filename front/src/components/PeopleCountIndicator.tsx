import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function PeopleCountIndicator({
  count,
  capacity,
  className,
}: {
  count: number;
  capacity?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-sm text-ink-soft", className)}
    >
      <Users className="h-4 w-4 text-gray-400" />
      <span className="font-semibold text-ink">{count}</span>
      {capacity ? <span className="text-gray-400">/ {capacity}명</span> : <span className="text-gray-400">명</span>}
    </span>
  );
}
