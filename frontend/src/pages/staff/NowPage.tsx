import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { StaffSpaceCard } from "@/components/staff/StaffSpaceCard";
import { StaffConfirmSheet } from "@/components/staff/StaffConfirmSheet";
import { FocusResidentSection } from "@/components/resident/FocusResidentSection";
import { useDashboard } from "@/hooks/useDashboard";
import { useUiStore } from "@/store/uiStore";
import { signalDanger } from "@/lib/alert";
import { attentionRank, needsAttention } from "@/lib/staffCopy";
import type { Space } from "@/types";

export function NowPage() {
  const { data, loading, reload } = useDashboard();
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const [selected, setSelected] = useState<Space | null>(null);
  const seenDanger = useRef<Set<string>>(new Set());

  const attention = useMemo(() => {
    if (!data) return [];
    return data.spaces
      .filter((s) => s.isActive)
      .filter((s) => needsAttention(data.statuses[s.id]?.status ?? "STABLE"))
      .sort(
        (a, b) =>
          attentionRank[data.statuses[a.id]?.status ?? "STABLE"] -
          attentionRank[data.statuses[b.id]?.status ?? "STABLE"]
      );
  }, [data]);

  // 새로운 위험 발생 시에만 소리/진동 (반복 자극 방지)
  useEffect(() => {
    if (!data) return;
    const dangerIds = attention
      .filter((s) => data.statuses[s.id]?.status === "DANGER")
      .map((s) => s.id);
    const hasNew = dangerIds.some((id) => !seenDanger.current.has(id));
    if (hasNew) signalDanger(soundEnabled);
    seenDanger.current = new Set(dangerIds);
  }, [data, attention, soundEnabled]);

  if (loading && !data) {
    return <p className="py-20 text-center text-staff-body text-ink-soft">불러오는 중입니다...</p>;
  }
  if (!data) return null;

  const floorOf = (id: string) => data.floors.find((f) => f.id === id);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-staff-name text-ink">
          {attention.length > 0 ? (
            <>
              지금 확인할 곳{" "}
              <span className="text-status-danger">{attention.length}곳</span>
            </>
          ) : (
            "지금 확인할 곳"
          )}
        </h1>
        <button
          onClick={reload}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-border px-4 text-base font-bold text-ink-soft hover:bg-surface2"
        >
          <RefreshCw className={loading ? "h-5 w-5 animate-spin" : "h-5 w-5"} />
          새로 보기
        </button>
      </div>

      <FocusResidentSection />

      {attention.length === 0 ? (
        <div className="rounded-2xl border-2 border-status-stable/40 bg-status-stableBg px-6 py-16 text-center">
          <ShieldCheck className="mx-auto mb-4 h-16 w-16 text-status-stable" />
          <p className="text-staff-status text-status-stable">지금은 모든 곳이 안정적입니다.</p>
          <p className="mt-2 text-staff-body text-ink-soft">확인이 필요한 곳이 생기면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {attention.map((space) => (
            <StaffSpaceCard
              key={space.id}
              space={space}
              floor={floorOf(space.floorId)}
              status={data.statuses[space.id]}
              onConfirm={() => setSelected(space)}
              onHelp={() => setSelected(space)}
            />
          ))}
        </div>
      )}

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
