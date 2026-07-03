// 가역 숨김 상태, 백엔드 컨트롤러 부활 시 재배선.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Film, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/primitives";
import { RiskBadge } from "@/components/RiskBadge";
import { EventTimeline } from "@/components/EventTimeline";
import { residentService } from "@/services/residentService";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";
import { formatDateTime } from "@/lib/format";
import { residentActionLabel } from "@/lib/labels";
import { adminPath } from "@/lib/routeAccess";
import type { DetectionEvent, FocusResidentView, ResidentAction, VideoClip } from "@/types";

type Detail = FocusResidentView & {
  recentEvents: DetectionEvent[];
  clip?: VideoClip;
  deltaScore: number;
};

export function FocusResidentsPage() {
  const facilityId = useActiveFacilityId();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    residentService.listFocus(facilityId).then((list) => setIds(list.map((v) => v.resident.id)));
  }, [facilityId]);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="관심 어르신"
        description="AI가 오늘 더 자주 확인할 어르신을 선별했습니다. (집중 관찰 지원)"
      />
      {ids.length === 0 ? (
        <p className="text-sm text-ink-soft">오늘 집중 관찰 대상이 없습니다.</p>
      ) : (
        ids.map((id) => (
          <ResidentDetailCard key={id} residentId={id} />
        ))
      )}
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-status-danger">
        <TrendingUp className="h-4 w-4" /> 전일 대비 +{value}
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-status-stable">
        <TrendingDown className="h-4 w-4" /> 전일 대비 {value}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-faint">
      <Minus className="h-4 w-4" /> 전일과 동일
    </span>
  );
}

function ResidentDetailCard({ residentId }: { residentId: string }) {
  const navigate = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [actions, setActions] = useState<ResidentAction[]>([]);

  useEffect(() => {
    residentService.getDetail(residentId).then((x) => setD(x as Detail | null));
    residentService.listActions(residentId).then(setActions);
  }, [residentId]);

  if (!d) return null;
  const t = d.today;
  const counts: { label: string; n: number }[] = [
    { label: "침상 이탈", n: t.bedExitCount },
    { label: "배회", n: t.wanderingCount },
    { label: "반복 기립", n: t.standingAttemptCount },
    { label: "복도 단독 이동", n: t.hallwayMoveCount },
    { label: "장시간 미움직임", n: t.longInactivityCount },
  ].filter((c) => c.n > 0);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-brand" />
          <h3 className="text-lg font-bold text-ink">
            {d.room?.name} {d.bedName && <span className="text-ink-soft">{d.bedName}</span>} {d.resident.name}
          </h3>
          <span className="text-sm text-ink-faint">
            {d.resident.age}세 · {d.resident.diagnosisTags.join(", ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge level={t.riskLevel} />
          <span className="rounded-md bg-surface2 px-2 py-1 text-xs font-semibold text-ink-soft">
            위험 점수 {t.fallRiskScore}
          </span>
        </div>
      </div>

      {/* 위험 행동 횟수 + 전일 대비 */}
      <div className="flex flex-wrap items-center gap-2">
        {counts.map((c) => (
          <span key={c.label} className="rounded-lg bg-surface2 px-2.5 py-1 text-sm text-ink-soft">
            {c.label} <b className="text-ink">{c.n}회</b>
          </span>
        ))}
        <Delta value={d.deltaScore} />
      </div>

      {/* AI 판단 근거 */}
      <div className="rounded-xl border border-border bg-surface2 p-3">
        <div className="text-xs font-semibold text-ink-soft">AI 판단 근거</div>
        <p className="mt-1 text-sm text-ink">{t.aiSummary}</p>
        <p className="mt-1 text-sm text-brand">권장: {t.recommendedAction}</p>
      </div>

      {/* 관련 영상 클립 */}
      {d.clip && d.recentEvents[0] && (
        <button
          onClick={() => navigate(adminPath(`events/${d.clip!.eventId}`))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10"
        >
          <Film className="h-4 w-4" />
          관련 근거 영상 보기
        </button>
      )}

      {/* 최근 이벤트 */}
      {d.recentEvents.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-soft">최근 이벤트</div>
          <EventTimeline events={d.recentEvents} />
        </div>
      )}

      {/* 조치 기록 */}
      <div>
        <div className="mb-2 text-xs font-semibold text-ink-soft">조치 기록</div>
        {actions.length === 0 ? (
          <p className="text-sm text-ink-faint">아직 조치 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {actions.map((a) => (
              <li key={a.id} className="rounded-lg bg-surface2 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{residentActionLabel[a.type]}</span>
                <span className="text-ink-faint"> · {a.createdBy} · {formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
