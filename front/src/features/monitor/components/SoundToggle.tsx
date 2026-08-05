import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clearTTSFailure,
  getTTSFailureReason,
  subscribeTTSFailure,
} from "@/features/monitor/services/tts/ttsManager";
import type { TTSFailureReason } from "@/features/monitor/services/tts/ttsProvider";

/**
 * 실패 사유별 안내 문구.
 *
 * TV를 켜두기만 하고 아무도 클릭하지 않으면 브라우저 autoplay 정책이 첫
 * 발화를 막는다. 예전에는 그 실패를 조용히 삼켜서 "음성 안내 켜짐"인데
 * 낙상이 나도 소리가 안 나는 상태가 됐다. 요양보호사가 바로 행동할 수
 * 있는 문구로 표면화한다.
 */
const FAILURE_MESSAGE: Record<TTSFailureReason, string> = {
  blocked: "소리를 켜려면 화면을 한 번 눌러 주세요.",
  unsupported: "이 브라우저는 음성 안내를 지원하지 않습니다.",
  engine: "음성 안내를 재생하지 못했습니다. 소리를 다시 켜 주세요.",
};

/** 음성(TTS) 안내 켜기/끄기 — 켜면 주의/위험/응급을 음성으로 안내 */
export function SoundToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  const [failure, setFailure] = useState<TTSFailureReason | null>(() =>
    getTTSFailureReason()
  );

  useEffect(() => subscribeTTSFailure(setFailure), []);

  function handleToggle() {
    // 사용자의 클릭은 autoplay 정책상 유효한 제스처다. 재시도 기회를 준다.
    clearTTSFailure();
    onToggle();
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-base font-semibold transition-colors",
          enabled
            ? "border-brand/40 bg-brand-soft text-brand"
            : "border-border text-ink-soft hover:bg-surface2"
        )}
        title="음성 안내(TTS)"
      >
        {enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        음성 안내 {enabled ? "켜짐" : "꺼짐"}
      </button>
      {enabled && failure && (
        <p role="alert" className="text-sm font-medium text-status-danger">
          {FAILURE_MESSAGE[failure]}
        </p>
      )}
    </div>
  );
}
