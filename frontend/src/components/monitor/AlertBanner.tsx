import { AlertTriangle } from "lucide-react";
import type { Space, SpaceStatus } from "@/types";

/** 위험/주의 공간을 상단에 큰 배너로 — 멀리서도 즉시 인지 */
export function AlertBanner({
  spaces,
  statuses,
}: {
  spaces: Space[];
  statuses: Record<string, SpaceStatus>;
}) {
  const urgent = spaces
    .map((s) => ({ space: s, st: statuses[s.id] }))
    .filter((x) => x.st && (x.st.status === "DANGER" || x.st.status === "CAUTION"))
    .sort((a) => (a.st!.status === "DANGER" ? -1 : 1));

  if (urgent.length === 0) return null;

  const hasDanger = urgent.some((u) => u.st!.status === "DANGER");

  return (
    <div
      className={
        "flex items-center gap-3 rounded-2xl border-2 px-5 py-3 " +
        (hasDanger
          ? "border-status-danger bg-status-dangerBg animate-pulse-danger"
          : "border-status-caution bg-status-cautionBg")
      }
    >
      <AlertTriangle
        className={"h-8 w-8 shrink-0 " + (hasDanger ? "text-status-danger" : "text-status-caution")}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xl font-bold 2xl:text-2xl">
        {urgent.slice(0, 3).map((u) => (
          <span
            key={u.space.id}
            className={u.st!.status === "DANGER" ? "text-status-danger" : "text-status-caution"}
          >
            {u.space.name} 확인 필요 · {u.st!.aiSummary}
          </span>
        ))}
      </div>
    </div>
  );
}
