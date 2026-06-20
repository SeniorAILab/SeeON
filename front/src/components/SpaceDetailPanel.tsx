import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Camera, UserCog, Users, Activity, AlertTriangle, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, timeAgo } from "@/lib/format";
import { levelLabel, spaceTypeLabel } from "@/lib/labels";
import { StatusBadge } from "./StatusBadge";
import { RiskBadge } from "./RiskBadge";
import { KakaoAlertStatusBadge } from "./KakaoAlertStatusBadge";
import { AIInsightBox } from "./AIInsightBox";
import { EventTimeline } from "./EventTimeline";
import { ActionLogForm } from "./ActionLogForm";
import { Button } from "./ui/primitives";
import { dashboardService } from "@/services/dashboardService";
import { eventService } from "@/services/eventService";
import { zoneService, type ZoneWithResident } from "@/services/zoneService";
import { BedDouble } from "lucide-react";
import { sampleTimeline } from "@/data/mockData";
import { useAuthStore, canAcknowledge, canAdmin } from "@/store/authStore";
import type { ActionType, DetectionEvent, Floor, Space, SpaceStatus } from "@/types";

interface Props {
  space: Space;
  floor?: Floor;
  status?: SpaceStatus;
  onClose: () => void;
  onChanged?: () => void;
}

export function SpaceDetailPanel({ space, floor, status, onClose, onChanged }: Props) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<ZoneWithResident[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    dashboardService.getSpaceEvents(space.id).then((list) => {
      if (!active) return;
      setEvents(list.length ? list : sampleTimeline.filter((e) => e.spaceId === space.id));
      setLoading(false);
    });
    zoneService.listZonesWithResidents(space.id).then((z) => {
      if (active) setZones(z);
    });
    return () => {
      active = false;
    };
  }, [space.id]);

  const openEvent = events.find(
    (e) => e.riskLevel !== "LOW" && e.kakaoAlertStatus !== "ACKNOWLEDGED"
  );

  async function handleAction(type: ActionType, note: string) {
    if (!user) return;
    if (openEvent) {
      await eventService.addAction(openEvent.id, type, note || undefined, user.name);
    }
    const refreshed = await dashboardService.getSpaceEvents(space.id);
    setEvents(refreshed.length ? refreshed : events);
    onChanged?.();
  }

  const signals: { label: string; active: boolean; Icon: typeof Activity }[] = [
    { label: "침대 주변 활동", active: !!status?.bedsideActivity, Icon: Activity },
    { label: "장시간 미움직임", active: !!status?.prolongedInactivity, Icon: AlertTriangle },
    { label: "혼자 이동 시도", active: !!status?.soloMovementAttempt, Icon: Users },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-panel">
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-ink">{space.name}</h2>
              {status && <StatusBadge status={status.status} />}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {floor?.name} · {spaceTypeLabel[space.type]}
              {status && ` · ${timeAgo(status.lastDetectedAt)} 업데이트`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* AI 설명 */}
          {status && (
            <AIInsightBox
              summary={status.aiSummary}
              status={status.status}
              confidence={openEvent?.confidence}
            />
          )}

          {/* 관리자 전용: 이슈 상세·근거 영상 진입 */}
          {canAdmin(user) && openEvent && (
            <button
              onClick={() => navigate(`/admin/events/${openEvent.id}`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/10"
            >
              <Film className="h-4 w-4" />
              이슈 상세 · 근거 영상 보기
            </button>
          )}

          {/* 현재 상태 지표 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">현재 상태</h3>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="현재 인원" value={`${status?.peopleCount ?? 0}명`} />
              <Metric label="움직임" value={status ? levelLabel[status.movementLevel] : "—"} />
              <Metric label="낙상 위험" value={status ? levelLabel[status.fallRiskLevel] : "—"} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {signals.map((s) => (
                <span
                  key={s.label}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                    s.active
                      ? "bg-status-cautionBg text-status-caution font-medium"
                      : "bg-gray-50 text-gray-400"
                  )}
                >
                  <s.Icon className="h-3 w-3" />
                  {s.label}
                  {s.active ? " 감지" : " 없음"}
                </span>
              ))}
            </div>
          </section>

          {/* 공간 기본 정보 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">공간 정보</h3>
            <dl className="space-y-1.5 rounded-xl border border-border p-3 text-sm">
              <Row icon={Camera} label="연결 카메라" value={space.cameraId} />
              <Row icon={Users} label="수용 인원" value={`${space.capacity}명`} />
              <Row icon={UserCog} label="담당 직원" value={space.assignedStaff ?? "미지정"} />
            </dl>
          </section>

          {/* 구역/침대 배정 (얼굴 인식 없이 침대 단위 매핑) */}
          {zones.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">구역 / 침대 배정</h3>
              <ul className="space-y-1.5 rounded-xl border border-border p-3 text-sm">
                {zones.map((z) => (
                  <li key={z.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <BedDouble className="h-3.5 w-3.5" />
                      {z.name}
                    </span>
                    <span className={z.resident ? "font-medium text-ink" : "text-gray-400"}>
                      {z.resident ? z.resident.name : "미배정"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 알림 상태 */}
          {status && status.kakaoAlertStatus !== "NONE" && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">알림 상태</h3>
              <div className="flex items-center gap-2 rounded-xl border border-border p-3">
                <KakaoAlertStatusBadge status={status.kakaoAlertStatus} />
                <span className="text-xs text-gray-400">
                  알림 규칙에 따라 담당 직원에게 카카오톡이 발송되었습니다.
                </span>
              </div>
            </section>
          )}

          {/* 이벤트 타임라인 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink">최근 이벤트</h3>
            {loading ? (
              <p className="text-sm text-gray-400">불러오는 중...</p>
            ) : (
              <EventTimeline events={events.slice(0, 8)} />
            )}
          </section>

          {/* 조치 기록 */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              직원 조치 기록
              {openEvent && <RiskBadge level={openEvent.riskLevel} />}
            </h3>
            {openEvent ? (
              <ActionLogForm onSubmit={handleAction} disabled={!canAcknowledge(user)} />
            ) : (
              <p className="rounded-lg bg-status-stableBg px-3 py-2 text-xs text-status-stable">
                현재 확인이 필요한 이벤트가 없습니다.
              </p>
            )}

            {openEvent && openEvent.actions.length > 0 && (
              <ul className="mt-3 space-y-2">
                {openEvent.actions.map((a) => (
                  <li key={a.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    <span className="font-medium text-ink">{a.createdBy}</span>
                    <span className="text-gray-400"> · {formatTime(a.createdAt)}</span>
                    {a.note && <p className="mt-0.5 text-ink-soft">{a.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="border-t border-border p-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            닫기
          </Button>
        </div>
      </aside>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3 text-center">
      <div className="text-base font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{label}</div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Camera;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-1.5 text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
