import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button } from "@/components/ui/primitives";
import { useUxTestStore, uxSummary } from "@/stores/uxTestStore";
import { useFeedbackStore, FEEDBACK_QUESTIONS } from "@/stores/feedbackStore";
import { formatDateTime } from "@/lib/format";
import { statusWord } from "@/lib/staffCopy";
import { monitorFloorPath } from "@/lib/routeAccess";
import { useActiveFacilityId } from "@/hooks/useActiveFacilityId";

export function UxTestResultPage() {
  const navigate = useNavigate();
  const facilityId = useActiveFacilityId();
  const logs = useUxTestStore((s) => s.logs);
  const reset = useUxTestStore((s) => s.reset);
  const responses = useFeedbackStore((s) => s.responses);
  const sum = uxSummary(logs);

  const mmss = (s: number) => `${Math.floor(s / 60)}분 ${s % 60}초`;

  const stats = [
    { label: "발생 이벤트", value: `${sum.total}건` },
    { label: "확인 완료", value: `${sum.acknowledged}건` },
    { label: "평균 확인 시간", value: sum.avgAckSeconds ? mmss(sum.avgAckSeconds) : "—" },
    { label: "TTS 재생", value: `${sum.ttsPlayed}회` },
    { label: "도움 요청", value: `${sum.helpRequests}건` },
  ];

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="UX 테스트 결과"
        description="2층 UX 검증 모드의 이벤트·확인 기록과 직원 피드백입니다."
        action={
          <Button
            variant="secondary"
            disabled={!facilityId}
            onClick={() => navigate(monitorFloorPath(facilityId, "fl_2f"))}
          >
            <ExternalLink className="h-4 w-4" />
            2층 검증 모드 열기
          </Button>
        }
      />

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className="text-2xl font-bold text-ink">{s.value}</div>
            <div className="mt-0.5 text-xs text-gray-400">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* 이벤트 로그 */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold text-ink">이벤트 기록</h3>
          {logs.length > 0 && (
            <button onClick={reset} className="text-xs text-gray-400 hover:text-status-danger">
              기록 초기화
            </button>
          )}
        </div>
        {logs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            아직 기록이 없습니다. 2층 검증 모드를 실행하면 이벤트가 기록됩니다.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-left text-xs text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">공간</th>
                <th className="px-4 py-2 font-medium">상태</th>
                <th className="px-4 py-2 font-medium">발생</th>
                <th className="px-4 py-2 font-medium">확인까지</th>
                <th className="px-4 py-2 font-medium">버튼</th>
                <th className="px-4 py-2 font-medium">TTS</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-ink">
                    {l.spaceName} {l.bed && <span className="text-ink-soft">{l.bed}</span>}
                  </td>
                  <td className="px-4 py-2 text-ink-soft">{statusWord[l.type]}</td>
                  <td className="px-4 py-2 text-ink-soft">{formatDateTime(new Date(l.detectedAt).toISOString())}</td>
                  <td className="px-4 py-2 text-ink-soft">
                    {l.ackSeconds != null ? mmss(l.ackSeconds) : "미확인"}
                  </td>
                  <td className="px-4 py-2 text-ink-soft">{l.button ?? "—"}</td>
                  <td className="px-4 py-2 text-ink-soft">{l.ttsPlayed ? "재생" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 직원 피드백 */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">직원 피드백 ({responses.length})</h3>
        {responses.length === 0 ? (
          <p className="text-sm text-gray-400">아직 제출된 피드백이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {responses.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1.5 text-xs text-gray-400">{formatDateTime(new Date(r.createdAt).toISOString())}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {FEEDBACK_QUESTIONS.map((q, i) => (
                    <span key={q} className="text-ink-soft">
                      {i + 1}. <b className={r.answers[i] === "예" ? "text-status-stable" : "text-status-caution"}>{r.answers[i] ?? "—"}</b>
                    </span>
                  ))}
                </div>
                {r.memo && <p className="mt-1.5 text-ink">{r.memo}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
