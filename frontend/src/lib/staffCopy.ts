// =============================================================
// 현장 직원용 문구 — 영어/전문용어 없이, 바로 이해되는 한글만 사용
// 피하는 표현: AI, confidence, anomaly, detection, risk score,
//             camera ID, monitoring target, 비정상 행동
// =============================================================
import type { SpaceStatus, SpaceStatusLevel } from "@/types";

/** 상태 한 단어 */
export const statusWord: Record<SpaceStatusLevel, string> = {
  STABLE: "안정",
  CAUTION: "주의",
  DANGER: "위험",
  CHECK_NEEDED: "확인 필요",
};

/** "지금 무엇을 해야 하는지" 한 줄 안내 */
export const statusGuide: Record<SpaceStatusLevel, string> = {
  STABLE: "괜찮습니다.",
  CAUTION: "한번 살펴봐 주세요.",
  DANGER: "지금 바로 가보세요.",
  CHECK_NEEDED: "확인이 필요합니다.",
};

/** 현재 인원 표기: "3명 있음" / "아무도 없음" */
export function peoplePhrase(count: number): string {
  if (count <= 0) return "아무도 없음";
  return `${count}명 있음`;
}

/**
 * 짧은 설명 문구. mock 데이터의 aiSummary 는 이미 현장 한글이지만,
 * 혹시 모를 전문용어를 한 번 더 걸러주는 안전장치.
 */
export function plainDescription(status: SpaceStatus): string {
  const text = status.aiSummary?.trim();
  if (text) return text;
  switch (status.status) {
    case "DANGER":
      return "혼자 일어나거나 움직이려는 모습이 보입니다.";
    case "CAUTION":
      return "평소보다 움직임이 많습니다.";
    case "CHECK_NEEDED":
      return "한동안 움직임이 없습니다.";
    default:
      return "현재 안정적인 상태입니다.";
  }
}

/** 위험/주의/확인 필요만 "지금 확인할 곳"에 노출 */
export function needsAttention(level: SpaceStatusLevel): boolean {
  return level !== "STABLE";
}

/** 정렬 우선순위: 위험 → 확인 필요 → 주의 → 안정 */
export const attentionRank: Record<SpaceStatusLevel, number> = {
  DANGER: 0,
  CHECK_NEEDED: 1,
  CAUTION: 2,
  STABLE: 3,
};
