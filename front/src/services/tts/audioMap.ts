// =============================================================
// 오디오 매핑 — (공간, 단계) → 사전 생성 mp3 경로 + 안내 문구
//   예) 201호 위험  → /audio/tts/2F/201_danger.mp3
//       203호 응급  → /audio/tts/2F/203_emergency.mp3
//       중앙복도 위험 → /audio/tts/common/center_hallway_danger.mp3
// =============================================================
import {
  COMMON_SLUGS,
  MESSAGES,
  summaryMessage,
  type AudioLevel,
  type SpaceCategory,
} from "./ttsConfig";
import type { SpaceType } from "@/types";

export const AUDIO_BASE = "/audio/tts";

export function categoryOf(type: SpaceType): SpaceCategory {
  if (type === "ROOM") return "room";
  if (type === "HALLWAY") return "hallway";
  return "common";
}

/** "201호" → "201" (호실 번호만) */
function roomNumber(name: string): string {
  return name.replace(/호$/, "");
}

export function commonSlug(name: string): string {
  return COMMON_SLUGS[name] ?? name.replace(/\s+/g, "_");
}

/** 안내 문구 */
export function textFor(category: SpaceCategory, level: AudioLevel, name: string): string {
  return MESSAGES[category][level](name);
}
export { summaryMessage };

/** 사전 생성 mp3 경로 */
export function audioPathFor(opts: {
  category: SpaceCategory;
  level: AudioLevel;
  name: string;
  floorName: string;
}): string {
  const { category, level, name, floorName } = opts;
  if (category === "room") {
    return `${AUDIO_BASE}/${floorName}/${roomNumber(name)}_${level}.mp3`;
  }
  return `${AUDIO_BASE}/common/${commonSlug(name)}_${level}.mp3`;
}

export const summaryPath = `${AUDIO_BASE}/common/summary.mp3`;

/** 매니페스트(생성된 실제 mp3 목록) 형식 */
export interface AudioManifest {
  version: number;
  generatedAt: string;
  provider: string;
  items: Record<string, { text: string; real: boolean }>;
}
export const MANIFEST_PATH = `${AUDIO_BASE}/manifest.json`;
