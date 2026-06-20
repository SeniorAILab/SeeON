import { useEffect, useMemo } from "react";
import { ttsManager, type TTSAlertInput } from "@/services/tts/ttsManager";
import { categoryOf } from "@/services/tts/audioMap";
import type { Floor, Space, SpaceStatus } from "@/types";

/** 공간 상태 → TTS 알림 입력으로 변환 (주의/위험/응급만) */
export function buildTTSAlerts(
  spaces: Space[],
  statuses: Record<string, SpaceStatus>,
  floors: Floor[]
): TTSAlertInput[] {
  const floorName = (id: string) => floors.find((f) => f.id === id)?.name ?? "";
  const out: TTSAlertInput[] = [];
  for (const s of spaces) {
    const st = statuses[s.id];
    if (!st) continue;
    const common = {
      spaceId: s.id,
      name: s.name,
      reason: st.aiSummary,
      floorName: floorName(s.floorId),
      category: categoryOf(s.type),
    };
    if (st.emergency) out.push({ ...common, level: "EMERGENCY" });
    else if (st.status === "DANGER") out.push({ ...common, level: "DANGER" });
    else if (st.status === "CAUTION" || st.status === "CHECK_NEEDED")
      out.push({ ...common, level: "CAUTION" });
  }
  return out;
}

/** 모니터 화면에서 활성 알림을 TTS 매니저에 동기화 */
export function useTTSAlerts(alerts: TTSAlertInput[], enabled: boolean) {
  const sig = useMemo(
    () => alerts.map((a) => `${a.spaceId}:${a.level}`).sort().join("|"),
    [alerts]
  );
  useEffect(() => {
    ttsManager.update(alerts, enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled]);
}
