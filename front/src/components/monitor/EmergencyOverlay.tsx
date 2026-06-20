import { AlertOctagon, Users, ChevronRight } from "lucide-react";
import { AcknowledgementButton } from "./AcknowledgementButton";
import { peoplePhrase } from "@/lib/staffCopy";
import type { Floor, Space, SpaceStatus } from "@/types";

/**
 * 응급 오버레이 — 화면 중앙 대형 표시 + 배경 딤.
 * 확인 완료 전까지 유지(자동 사라짐 금지).
 */
export function EmergencyOverlay({
  space,
  floor,
  status,
  others,
  onAck,
  onDetail,
}: {
  space: Space;
  floor?: Floor;
  status?: SpaceStatus;
  others: number; // 다른 주의/위험 공간 수
  onAck: () => void;
  onDetail: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-3xl rounded-[2rem] border-4 border-status-danger bg-surface p-8 text-center shadow-2xl animate-pulse-danger 2xl:p-12">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-status-dangerBg">
          <AlertOctagon className="h-12 w-12 text-status-danger" />
        </div>

        <div className="text-3xl font-extrabold text-status-danger 2xl:text-4xl">응급 확인 필요</div>
        <h2 className="mt-2 text-7xl font-black leading-none text-ink 2xl:text-8xl">
          {space.name}
          {floor && <span className="ml-3 text-3xl font-bold text-ink-faint">{floor.name}</span>}
        </h2>

        <div className="mt-5 flex items-center justify-center gap-2 text-3xl font-bold text-ink">
          <Users className="h-9 w-9 text-ink-faint" />
          {peoplePhrase(status?.peopleCount ?? 0)}
        </div>

        <p className="mt-3 text-4xl font-extrabold text-ink 2xl:text-5xl">
          {status?.aiSummary ?? "즉시 확인해주세요."}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <AcknowledgementButton onAck={onAck} size="lg" />
          <button
            onClick={onDetail}
            className="inline-flex min-h-[72px] items-center gap-2 rounded-2xl border-2 border-ink/20 px-8 text-3xl font-bold text-ink-soft hover:bg-black/5"
          >
            상세 보기
            <ChevronRight className="h-7 w-7" />
          </button>
        </div>

        {others > 0 && (
          <p className="mt-5 text-xl text-ink-faint">
            확인이 필요한 다른 공간 {others}곳이 더 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
