// =============================================================
// TTS rooms/messages 설정
//   · 안내 문구 템플릿(공간 종류 × 위험 단계)
//   · 공용 공간 슬러그(파일명에 쓰는 영문 키)
// 이 파일만 고치면 사전 생성 스크립트와 런타임 재생 모두 반영된다.
// =============================================================

/** 파일/우선순위에 쓰는 위험 단계 (소문자) */
export type AudioLevel = "caution" | "danger" | "emergency";

/** 공간 분류 — 문구/경로 결정 */
export type SpaceCategory = "room" | "hallway" | "common";

/** 안내 문구 템플릿 (사전 생성 mp3 와 폴백 음성이 동일하게 사용) */
export const MESSAGES: Record<SpaceCategory, Record<AudioLevel, (name: string) => string>> = {
  room: {
    caution: (n) => `${n} 확인해 주세요.`,
    danger: (n) => `${n} 확인이 필요합니다.`,
    emergency: (n) => `${n} 응급 상황입니다. 직원 확인이 필요합니다.`,
  },
  hallway: {
    caution: (n) => `${n} 이동이 감지되었습니다.`,
    danger: (n) => `${n} 단독 이동이 감지되었습니다. 확인이 필요합니다.`,
    emergency: (n) => `${n} 응급 상황입니다. 직원 확인이 필요합니다.`,
  },
  common: {
    caution: (n) => `${n} 확인해 주세요.`,
    danger: (n) => `${n} 확인이 필요합니다.`,
    emergency: (n) => `${n} 응급 상황입니다. 직원 확인이 필요합니다.`,
  },
};

/** 첫 안내(동시 다발) 요약 문구 */
export const summaryMessage = (count: number) =>
  `현재 확인이 필요한 공간이 ${count}곳 있습니다.`;

/** 공용 공간 이름 → 파일 슬러그 */
export const COMMON_SLUGS: Record<string, string> = {
  중앙복도: "center_hallway",
  좌측복도: "left_hallway",
  우측복도: "right_hallway",
  복도: "hallway",
  프로그램실: "program_room",
  물리치료실: "rehab_room",
  식당: "dining",
  로비: "lobby",
  상담실: "counsel",
  사무실: "office",
  간호스테이션: "nurse_station",
  출입구: "entrance",
  창고: "storage",
  직원휴게공간: "staff_lounge",
};

/** 단계별 안내가 의미있는 공간만(예: 창고/사무실 등은 caution 만) */
export const LEVELS_BY_CATEGORY: Record<SpaceCategory, AudioLevel[]> = {
  room: ["caution", "danger", "emergency"],
  hallway: ["caution", "danger", "emergency"],
  common: ["caution", "danger"],
};
