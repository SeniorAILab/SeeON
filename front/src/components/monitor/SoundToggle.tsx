import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/** 음성(TTS) 안내 켜기/끄기 — 켜면 주의/위험/응급을 음성으로 안내 */
export function SoundToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
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
  );
}
