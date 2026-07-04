// =============================================================
// TTS rooms/messages 설정 — 고정 안내 문구 단일 경로
// =============================================================

/** 파일/우선순위에 쓰는 위험 단계 (소문자) */
export type AudioLevel = "caution" | "danger" | "emergency";

/** 고정 안내 문구 템플릿 */
export const TTS_MESSAGE_TEMPLATE = "{방}에서 {이벤트} 발생, 확인이 필요합니다";

export const eventWordForLevel: Record<AudioLevel, string> = {
  caution: "주의",
  danger: "위험",
  emergency: "응급",
};

