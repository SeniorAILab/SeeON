import { ShieldAlert } from "lucide-react";

/** 영상 영역 상단 고정 안내 — 이 기능이 "관제"가 아님을 분명히 한다. */
export function VideoAccessNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5 text-xs leading-relaxed text-ink-soft break-keep">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <span>
        <span className="inline-block">
          AI가 위험으로 감지한 <b className="text-ink">이벤트 구간만</b> 제공합니다.
        </span>{" "}
        <span className="inline-block">관리자만 확인할 수 있습니다.</span>{" "}
        <span className="inline-block">직원용 화면에는 표시되지 않습니다.</span>{" "}
        <span className="inline-block">실시간 CCTV 탐색은 지원하지 않습니다.</span>
      </span>
    </div>
  );
}
