import { useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { eventService } from "@/services/eventService";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import { spaces } from "@/data/mockData";
import { formatDateTime } from "@/lib/format";
import { StaffStatusBadge } from "@/components/staff/StaffStatusBadge";
import type { DetectionEvent, Level, SpaceStatusLevel } from "@/types";

const riskToStatus: Record<Level, SpaceStatusLevel> = {
  LOW: "STABLE",
  MEDIUM: "CAUTION",
  HIGH: "DANGER",
};

export function AlertsPage() {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? "fac_happy_nokyang";

  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eventService.listByFacility(facilityId).then((list) => {
      setEvents(list.filter((e) => e.kakaoAlertStatus === "ACKNOWLEDGED"));
      setLoading(false);
    });
  }, [facilityId]);

  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      <h1 className="text-staff-name text-ink">확인한 알림</h1>

      {loading ? (
        <p className="py-16 text-center text-staff-body text-ink-soft">불러오는 중입니다...</p>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border-2 border-border bg-surface px-6 py-16 text-center">
          <CheckCheck className="mx-auto mb-4 h-14 w-14 text-ink-faint" />
          <p className="text-staff-body text-ink-soft">아직 확인 처리한 알림이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-2xl border-2 border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-staff-status text-ink">{spaceName(ev.spaceId)}</span>
                <StaffStatusBadge status={riskToStatus[ev.riskLevel]} />
              </div>
              <p className="mt-2 text-staff-body text-ink-soft">{ev.aiSummary}</p>
              <p className="mt-2 text-base text-ink-faint">
                {ev.acknowledgedBy ? `${ev.acknowledgedBy} 확인` : "확인 완료"} ·{" "}
                {formatDateTime(ev.acknowledgedAt ?? ev.detectedAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
