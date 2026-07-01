import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Film } from "lucide-react";
import { Card, Button, Textarea } from "@/components/ui/primitives";
import { RiskBadge } from "@/components/RiskBadge";
import { KakaoAlertStatusBadge } from "@/components/KakaoAlertStatusBadge";
import { AIInsightBox } from "@/components/AIInsightBox";
import { EventTimeline } from "@/components/EventTimeline";
import { ActionLogForm } from "@/components/ActionLogForm";
import { VideoPermissionGuard } from "@/components/video/VideoPermissionGuard";
import { VideoUnavailableState } from "@/components/video/VideoUnavailableState";
import { VideoAccessNotice } from "@/components/video/VideoAccessNotice";
import { AdminEventVideoPlayer } from "@/components/video/AdminEventVideoPlayer";
import { VideoAccessLogTable } from "@/components/video/VideoAccessLogTable";
import { eventService } from "@/services/eventService";
import { dashboardService } from "@/services/dashboardService";
import { videoService } from "@/services/videoService";
import { useAuthStore } from "@/store/authStore";
import { canAcknowledge } from "@/lib/rolePolicy";
import { spaces, floors } from "@/data/mockData";
import { formatDateTime } from "@/lib/format";
import { eventTypeLabel, kakaoLabel } from "@/lib/labels";
import type {
  ActionType,
  DetectionEvent,
  Level,
  SpaceStatusLevel,
  VideoClip,
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
  const [clip, setClip] = useState<VideoClip | null>(null);
  const [clipChecked, setClipChecked] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoSaved, setMemoSaved] = useState(false);
  const [logKey, setLogKey] = useState(0);

  async function loadEvent() {
    if (!eventId) return;
    const ev = await eventService.getById(eventId);
    setEvent(ev ?? null);
    if (ev) {
      const list = await dashboardService.getSpaceEvents(ev.spaceId);
      setTimeline(list);
    }
  }

  useEffect(() => {
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // 영상 메타 로드(관리자 권한 검증 + VIEW 로그) — 권한 가드는 UI, 서비스는 보안 경계
  useEffect(() => {
    if (!eventId) return;
    videoService
      .getEventVideo(eventId, user)
      .then((c) => setClip(c))
      .catch(() => setClip(null))
      .finally(() => {
        setClipChecked(true);
        setLogKey((k) => k + 1);
      });
  }, [eventId, user]);

  if (!event) {
    return <p className="py-16 text-center text-sm text-ink-soft">불러오는 중...</p>;
  }

  const space = spaces.find((s) => s.id === event.spaceId);
  const floor = floors.find((f) => f.id === space?.floorId);
  const acked = event.kakaoAlertStatus === "ACKNOWLEDGED";

  async function handleAction(type: ActionType, note: string) {
    if (!user || !event) return;
    await eventService.addAction(event.id, type, note || undefined, user.name);
    loadEvent();
  }

  async function saveMemo() {
    if (!user || !event || !memo.trim()) return;
    await eventService.addAction(event.id, "MEMO", memo.trim(), user.name);
    setMemo("");
    setMemoSaved(true);
    loadEvent();
  }

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
              {space?.name} 이슈 상세
            </h1>
            <p className="mt-0.5 text-sm text-ink-faint">
              {floor?.name} · {eventTypeLabel[event.eventType]} · {formatDateTime(event.detectedAt)}
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
          <AIInsightBox
            summary={event.aiSummary}
            status={riskToStatus[event.riskLevel]}
          />
        </div>
      </Card>

      {/* 영상 영역 (관리자 전용) */}
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
          <Film className="h-4.5 w-4.5 h-[18px] w-[18px]" />
          감지 근거 영상
        </h2>
        <VideoPermissionGuard>
          {!clipChecked ? (
            <p className="text-sm text-ink-soft">영상 정보를 확인하는 중...</p>
          ) : clip ? (
            <AdminEventVideoPlayer clip={clip} />
          ) : (
            <div className="space-y-2">
              <VideoAccessNotice />
              <VideoUnavailableState />
            </div>
          )}
        </VideoPermissionGuard>
      </Card>

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
          onChange={(e) => {
            setMemo(e.target.value);
            setMemoSaved(false);
          }}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" onClick={saveMemo} disabled={!canAcknowledge(user)}>
            <Save className="h-4 w-4" />
            메모 저장
          </Button>
          {memoSaved && <span className="text-sm text-status-stable">저장되었습니다.</span>}
        </div>
      </Card>

      {/* 조치 기록 */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-ink">조치 기록</h2>
        {event.actions.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {event.actions.map((a) => (
              <li key={a.id} className="rounded-lg bg-surface2 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{a.createdBy}</span>
                <span className="text-ink-faint"> · {formatDateTime(a.createdAt)}</span>
                {a.note && <p className="mt-0.5 text-ink-soft">{a.note}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink-faint">아직 조치 기록이 없습니다.</p>
        )}
        <ActionLogForm onSubmit={handleAction} disabled={!canAcknowledge(user)} />
      </Card>

      {/* 알림 + 영상 접근 로그 */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink">알림 / 접근 기록</h2>
          <KakaoAlertStatusBadge status={event.kakaoAlertStatus} />
          <span className="text-xs text-ink-faint">{kakaoLabel[event.kakaoAlertStatus]}</span>
        </div>
        {clip ? (
          <VideoAccessLogTable videoClipId={clip.id} refreshKey={logKey} />
        ) : (
          <p className="text-sm text-ink-faint">연결된 영상이 없어 접근 기록이 없습니다.</p>
        )}
      </Card>
    </div>
  );
}
