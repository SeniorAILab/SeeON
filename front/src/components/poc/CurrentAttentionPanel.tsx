import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { LargeRiskBadge } from "@/components/monitor/LargeRiskBadge";
import { AcknowledgementButton } from "@/components/monitor/AcknowledgementButton";
import { statusGuide } from "@/lib/staffCopy";
import type { Space, SpaceStatus } from "@/types";

export interface AttentionItem {
  space: Space;
  status: SpaceStatus;
  bed?: string; // 이벤트 시에만
  desc: string;
}

/** 대형 모니터에서 가장 중요한 영역 — "현재 확인 필요" */
export function CurrentAttentionPanel({
  items,
  onAck,
  onSelect,
}: {
  items: AttentionItem[];
  onAck: (spaceId: string) => void;
  onSelect: (space: Space) => void;
}) {
  return (
    <section className="rounded-2xl border-2 border-border bg-surface p-4">
      <h2 className="mb-3 text-2xl font-extrabold text-ink 2xl:text-3xl">현재 확인 필요</h2>

      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-status-stable/40 bg-status-stableBg px-4 py-8 text-center">
          <ShieldCheck className="mx-auto mb-2 h-12 w-12 text-status-stable" />
          <p className="text-xl font-bold text-status-stable 2xl:text-2xl">
            현재 즉시 확인할 공간은 없습니다.
          </p>
          <p className="mt-1 text-lg text-ink-soft">전체적으로 안정적인 상태입니다.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((it, i) => {
            const danger = it.status.status === "DANGER";
            return (
              <li
                key={it.space.id}
                className={cn(
                  "rounded-xl border-2 p-4",
                  danger
                    ? "border-status-danger bg-status-dangerBg animate-pulse-danger"
                    : "border-status-caution bg-status-cautionBg"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-ink-faint">{i + 1}.</span>
                    <span className="text-3xl font-extrabold text-ink 2xl:text-4xl">
                      {it.space.name}
                    </span>
                    {it.bed && (
                      <span className="text-2xl font-bold text-ink-soft">{it.bed}</span>
                    )}
                  </div>
                  <LargeRiskBadge status={it.status.status} size="md" />
                </div>
                <p className="mt-1.5 text-2xl font-semibold text-ink">{it.desc}</p>
                <p className="text-lg font-bold text-ink-soft">{statusGuide[it.status.status]}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AcknowledgementButton onAck={() => onAck(it.space.id)} />
                  <button
                    onClick={() => onSelect(it.space)}
                    className="inline-flex min-h-[56px] items-center rounded-2xl border-2 border-ink/20 px-5 text-xl font-bold text-ink-soft hover:bg-black/5"
                  >
                    상세 보기
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
