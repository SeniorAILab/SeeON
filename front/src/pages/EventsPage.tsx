import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Film } from "lucide-react";
import { Card, Button } from "@/components/ui/primitives";
import { videoClips } from "@/data/mockData";
import { RiskBadge } from "@/components/RiskBadge";
import { KakaoAlertStatusBadge } from "@/components/KakaoAlertStatusBadge";
import { eventService } from "@/services/eventService";
import { useAuthStore, canAcknowledge } from "@/store/authStore";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import { spaces } from "@/data/mockData";
import { formatDateTime } from "@/lib/format";
import { eventTypeLabel } from "@/lib/labels";
import type { DetectionEvent } from "@/types";

const FILTERS = [
  { key: "ALL", label: "전체" },
  { key: "OPEN", label: "미확인" },
  { key: "ACK", label: "확인 완료" },
];

export function EventsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const facilityId = useActiveFacilityId();

  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setEvents(await eventService.listByFacility(facilityId));
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  async function acknowledge(id: string) {
    if (!user) return;
    await eventService.acknowledge(id, user.name);
    load();
  }

  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? id;

  const filtered = events.filter((e) => {
    if (filter === "OPEN") return e.kakaoAlertStatus !== "ACKNOWLEDGED";
    if (filter === "ACK") return e.kakaoAlertStatus === "ACKNOWLEDGED";
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">이벤트</h1>
        <p className="mt-0.5 text-sm text-gray-400">AI가 감지한 안전 이벤트와 처리 현황입니다.</p>
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              "h-8 rounded-lg px-3 text-sm font-medium transition-colors " +
              (filter === f.key
                ? "bg-ink text-white"
                : "border border-border bg-white text-ink-soft hover:bg-gray-50")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-gray-400">
          이벤트가 없습니다.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((ev) => {
            const acked = ev.kakaoAlertStatus === "ACKNOWLEDGED";
            const hasClip = videoClips.some((c) => c.eventId === ev.id);
            return (
              <Card
                key={ev.id}
                onClick={() => navigate(`/admin/events/${ev.id}`)}
                className="flex cursor-pointer flex-wrap items-center gap-3 p-4 transition-colors hover:border-brand/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{spaceName(ev.spaceId)}</span>
                    <span className="text-sm text-ink-soft">{eventTypeLabel[ev.eventType]}</span>
                    <RiskBadge level={ev.riskLevel} />
                    <KakaoAlertStatusBadge status={ev.kakaoAlertStatus} />
                    {hasClip && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">
                        <Film className="h-3 w-3" />
                        영상
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{ev.aiSummary}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDateTime(ev.detectedAt)}
                    {ev.acknowledgedBy && ` · ${ev.acknowledgedBy} 확인`}
                  </p>
                </div>
                {acked ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-status-stable">
                    <CheckCircle2 className="h-4 w-4" />
                    확인 완료
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canAcknowledge(user)}
                    onClick={(e) => {
                      e.stopPropagation();
                      acknowledge(ev.id);
                    }}
                  >
                    확인 처리
                  </Button>
                )}
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
