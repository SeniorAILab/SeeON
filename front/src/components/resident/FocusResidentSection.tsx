import { useEffect, useState } from "react";
import { Heart, Volume2, Check, Footprints, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { residentService } from "@/services/residentService";
import { announceFocusResidents } from "@/services/tts/announceFocus";
import { useAuthStore } from "@/store/authStore";
import { canAcknowledge } from "@/lib/roles";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import { residentActionLabel } from "@/lib/labels";
import type { FocusResidentView, ResidentActionType } from "@/types";

// 직원용: 점수/모델 설명 없이 "오늘 더 자주 확인해주세요"만.
const BTNS: { type: ResidentActionType; label: string; Icon: typeof Check; tone: string }[] = [
  { type: "CHECKED", label: "확인함", Icon: Check, tone: "bg-status-stable" },
  { type: "STAFF_VISIT", label: "직원 방문 중", Icon: Footprints, tone: "bg-brand" },
  { type: "HELP_REQUEST", label: "도움 요청", Icon: Hand, tone: "bg-status-danger" },
];

export function FocusResidentSection() {
  const user = useAuthStore((s) => s.user);
  const facilityId = useActiveFacilityId();

  const [items, setItems] = useState<FocusResidentView[]>([]);
  const [doneMap, setDoneMap] = useState<Record<string, string>>({});

  const load = () => residentService.listFocus(facilityId).then(setItems);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  async function act(residentId: string, type: ResidentActionType) {
    if (!user) return;
    await residentService.addAction(residentId, type, user.name);
    setDoneMap((m) => ({ ...m, [residentId]: residentActionLabel[type] }));
  }

  function speak() {
    announceFocusResidents(
      items.map((v) => ({ name: v.resident.name, room: v.room?.name ?? "", reason: v.today.aiSummary }))
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border-2 border-brand/30 bg-brand-soft p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-staff-status text-ink">
          <Heart className="h-7 w-7 text-brand" />
          오늘 집중 관찰 필요 <span className="text-brand">{items.length}명</span>
        </h2>
        <button
          onClick={speak}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-brand/40 bg-surface px-3 text-base font-bold text-brand hover:bg-brand/10"
        >
          <Volume2 className="h-5 w-5" />
          음성으로 듣기
        </button>
      </div>

      <div className="space-y-3">
        {items.map((v) => (
          <div key={v.resident.id} className="rounded-2xl border-2 border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-staff-name text-ink">{v.room?.name}</span>
              {v.bedName && <span className="text-staff-status text-ink-soft">{v.bedName}</span>}
              <span className="text-staff-status text-ink">{v.resident.name}</span>
            </div>
            <p className="mt-1.5 text-staff-body text-ink">
              오늘 더 자주 확인해주세요. <span className="text-ink-soft">{v.today.aiSummary}</span>
            </p>

            {doneMap[v.resident.id] ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-status-stableBg px-4 py-2 text-staff-body font-bold text-status-stable">
                <Check className="h-5 w-5" />
                {doneMap[v.resident.id]} 처리했습니다.
              </p>
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {BTNS.map(({ type, label, Icon, tone }) => (
                  <button
                    key={type}
                    disabled={!canAcknowledge(user)}
                    onClick={() => act(v.resident.id, type)}
                    className={cn(
                      "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-4 text-staff-btn text-white disabled:opacity-50",
                      tone
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
