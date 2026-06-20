import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { StaffSpaceCard } from "@/components/staff/StaffSpaceCard";
import { StaffConfirmSheet } from "@/components/staff/StaffConfirmSheet";
import { useDashboard } from "@/hooks/useDashboard";
import { attentionRank } from "@/lib/staffCopy";
import type { Space } from "@/types";

export function RoomsPage() {
  const { data, loading, reload } = useDashboard();
  const [floorId, setFloorId] = useState("ALL");
  const [selected, setSelected] = useState<Space | null>(null);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.spaces
      .filter((s) => s.isActive)
      .filter((s) => floorId === "ALL" || s.floorId === floorId)
      .sort(
        (a, b) =>
          attentionRank[data.statuses[a.id]?.status ?? "STABLE"] -
          attentionRank[data.statuses[b.id]?.status ?? "STABLE"]
      );
  }, [data, floorId]);

  if (loading && !data) {
    return <p className="py-20 text-center text-staff-body text-ink-soft">불러오는 중입니다...</p>;
  }
  if (!data) return null;

  const floorOf = (id: string) => data.floors.find((f) => f.id === id);
  const tabs = [{ id: "ALL", name: "전체" }, ...data.floors];

  return (
    <div className="space-y-5">
      <h1 className="text-staff-name text-ink">전체 방 상태</h1>

      {/* 큰 층 탭 */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFloorId(t.id)}
            className={cn(
              "min-h-[48px] rounded-xl px-5 text-base font-bold transition-colors",
              floorId === t.id
                ? "bg-ink text-surface"
                : "border-2 border-border text-ink-soft hover:bg-surface2"
            )}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visible.map((space) => (
          <StaffSpaceCard
            key={space.id}
            space={space}
            floor={floorOf(space.floorId)}
            status={data.statuses[space.id]}
            onConfirm={() => setSelected(space)}
            compact
          />
        ))}
      </div>

      {selected && (
        <StaffConfirmSheet
          space={selected}
          floor={floorOf(selected.floorId)}
          status={data.statuses[selected.id]}
          onClose={() => setSelected(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}
