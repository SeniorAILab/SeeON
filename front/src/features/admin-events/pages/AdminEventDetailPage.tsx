import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Film } from "lucide-react";
import { Card, Button, Textarea } from "@/components/ui/primitives";
import { RiskBadge } from "@/components/RiskBadge";
import { AlertStatusBadge } from "@/components/AlertStatusBadge";
import { AIInsightBox } from "@/features/admin-events/components/AIInsightBox";
import { EventTimeline } from "@/features/admin-events/components/EventTimeline";
import { ActionLogForm } from "@/features/admin-events/components/ActionLogForm";
import { AlertEvidencePanel } from "@/features/admin-events/components/video/AlertEvidencePanel";
import { VideoPermissionGuard } from "@/features/admin-events/components/video/VideoPermissionGuard";
import { VideoAccessNotice } from "@/features/admin-events/components/video/VideoAccessNotice";
import { isEventClipsEnabled } from "@/features/admin-events/eventClipFeature";
import { eventService } from "@/services/eventService";
import { dashboardService } from "@/services/dashboardService";
import { useAuthStore } from "@/stores/authStore";
import { canAcknowledge } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";
import { displayEventTypeLabel, alertLabel } from "@/lib/labels";
import type {
  ActionType,
  DetectionEvent,
  Floor,
  Level,
  Space,
  SpaceStatusLevel,
} from "@/types";

const riskToStatus: Record<Level, SpaceStatusLevel> = {
  LOW: "STABLE",
  MEDIUM: "CAUTION",
  HIGH: "DANGER",
};

export function AdminEventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [event, setEvent] = useState<DetectionEvent | null>(null);
  const [timeline, setTimeline] = useState<DetectionEvent[]>([]);
  const [space, setSpace] = useState<Space | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [memo, setMemo] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);

  async function loadEvent() {
    if (!eventId) return;
    const ev = await eventService.getById(eventId);
    setEvent(ev ?? null);
    if (ev) {
      const dashboard = await dashboardService.getDashboard(ev.facilityId);
      const matchedSpace = dashboard.spaces.find((s) => s.id === ev.spaceId) ?? null;
      setSpace(matchedSpace);
      setFloor(dashboard.floors.find((f) => f.id === matchedSpace?.floorId) ?? null);
      setTimeline(
        dashboard.unacknowledgedEvents
          .filter((item) => item.spaceId === ev.spaceId)
          .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt)),
      );
    } else {
      setSpace(null);
      setFloor(null);
      setTimeline([]);
    }
  }

  useEffect(() => {
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!event) {
    return <p className="py-16 text-center text-sm text-ink-soft">불러오는 중...</p>;
  }

  const spaceName = space?.name ?? event.room ?? event.spaceId;
  const floorName = floor?.name ?? "층 정보 없음";
  const acked = event.alertStatus === "ACKNOWLEDGED";
  const eventClipsEnabled = isEventClipsEnabled();

  async function handleAction(type: ActionType, note: string) {
    if (!user || !event) return;
    await eventService.addAction(event.id, type, note || undefined, user.name);
    await loadEvent();
  }

  async function handleMemoSave() {
    if (!event || memo.trim().length === 0) return;
    setMemoSaving(true);
    try {
      await eventService.addAction(event.id, "MEMO", memo.trim(), user?.name ?? "관리자");
      setMemo("");
      await loadEvent();
    } finally {
      setMemoSaving(false);
    }
  }

  const adminNotes = event.actions.filter((action) => "authorRole" in action && action.authorRole === "ADMIN");
  const staffNotes = event.actions.filter((action) => !("authorRole" in action) || action.authorRole === "STAFF");


  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        이벤트 목록
      </button>

      {/* 상단 요약 */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink">
              {spaceName} 이슈 상세
            </h1>
            <p className="mt-0.5 text-sm text-ink-faint">
              {floorName} · {displayEventTypeLabel(event)} · {formatDateTime(event.detectedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge level={event.riskLevel} />
            <span
              className={
                "rounded-md px-2 py-1 text-xs font-semibold " +
                (acked
                  ? "bg-status-stableBg text-status-stable"
                  : "bg-status-cautionBg text-status-caution")
              }
            >
              {acked ? "확인 완료" : "확인 대기"}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-3 text-sm font-medium text-ink">
            AI 안전 분석: 위험 이벤트가 감지되었습니다
          </p>
          <AIInsightBox
            summary={event.aiSummary}
            status={riskToStatus[event.riskLevel]}
          />
        </div>
      </Card>

      {eventClipsEnabled && user !== null ? (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <Film aria-hidden="true" className="h-[18px] w-[18px]" />
            감지 근거 영상
          </h2>
          <p className="mb-3 text-sm leading-relaxed text-ink-faint break-keep">
            관리자 권한으로 이 알림에 연결된 안전 확인용 클립만 확인할 수 있습니다.
            보관 상태를 확인할 수 없으면 해당 상태를 그대로 표시합니다.
          </p>
          <VideoPermissionGuard>
            <div className="space-y-3">
              <VideoAccessNotice />
              <AlertEvidencePanel
                identity={{ facilityId: event.facilityId, alertId: event.id, userId: user.id }}
              />
            </div>
          </VideoPermissionGuard>
        </Card>
      ) : null}

      {/* 이벤트 타임라인 */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-ink">이벤트 타임라인</h2>
        <EventTimeline events={timeline.slice(0, 10)} />
      </Card>

      {/* 관리자 판단 메모 */}
      <Card className="p-5">
        <h2 className="mb-2 text-base font-semibold text-ink">관리자 판단 메모</h2>
        <Textarea
          rows={3}
          value={memo}
          placeholder="사고 판단/조치 근거를 기록하세요."
          onChange={(e) => setMemo(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={handleMemoSave} disabled={memoSaving || memo.trim().length === 0}>
            {memoSaving ? "저장 중..." : "메모 저장"}
          </Button>
        </div>
        {adminNotes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {adminNotes.map((a) => (
              <li key={a.id} className="rounded-lg bg-surface2 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{a.createdBy}</span>
                <span className="text-ink-faint"> · {formatDateTime(a.createdAt)}</span>
                {a.note && <p className="mt-0.5 text-ink-soft">{a.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 요양보호사 메모 */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-ink">요양보호사 메모</h2>
        {staffNotes.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {staffNotes.map((a) => (
              <li key={a.id} className="rounded-lg bg-surface2 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{a.createdBy}</span>
                <span className="text-ink-faint"> · {formatDateTime(a.createdAt)}</span>
                {a.note && <p className="mt-0.5 text-ink-soft">{a.note}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink-faint">아직 요양보호사 메모가 없습니다.</p>
        )}
        <ActionLogForm onSubmit={handleAction} disabled={!canAcknowledge(user)} />
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink">알림 상태</h2>
          <AlertStatusBadge status={event.alertStatus} />
          <span className="text-xs text-ink-faint">{alertLabel[event.alertStatus]}</span>
        </div>
        <p className="text-sm text-ink-faint">알림 처리 내역은 위의 타임라인과 메모에서 확인할 수 있습니다.</p>
      </Card>
    </div>
  );
}
