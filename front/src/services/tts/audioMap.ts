// =============================================================
// 오디오 매핑 — 단일 TTS 인스턴스 고정 문구만 제공한다.
// =============================================================
import { TTS_MESSAGE_TEMPLATE, eventWordForLevel, type AudioLevel } from "./ttsConfig";

/** 안내 문구 */
export function textFor(name: string, level: AudioLevel): string {
  return TTS_MESSAGE_TEMPLATE.replace("{방}", name).replace("{이벤트}", eventWordForLevel[level]);
}
