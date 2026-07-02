import type {
  ActionType,
  DetectionEventType,
  KakaoAlertStatus,
  Level,
  ResidentActionType,
  SpaceStatusLevel,
  SpaceType,
} from "@/types";

// 도메인 enum -> 한국어 라벨. 카피라이팅 원칙: "감시"가 아닌 "안전 확인" 톤.

export const statusLabel: Record<SpaceStatusLevel, string> = {
  STABLE: "안정",
  CAUTION: "주의",
  DANGER: "위험",
  CHECK_NEEDED: "확인 필요",
};

export const levelLabel: Record<Level, string> = {
  LOW: "낮음",
  MEDIUM: "중간",
  HIGH: "높음",
};

export const spaceTypeLabel: Record<SpaceType, string> = {
  ROOM: "생활실",
  HALLWAY: "복도",
  PROGRAM_ROOM: "프로그램실",
  REHAB_ROOM: "물리치료실",
  DINING: "식당",
  LOBBY: "로비",
  OFFICE: "사무/상담",
  NURSE_STATION: "간호스테이션",
  ENTRANCE: "출입구",
  STORAGE: "창고",
  STAFF_LOUNGE: "직원휴게",
  ETC: "기타",
};

export const kakaoLabel: Record<KakaoAlertStatus, string> = {
  NONE: "알림 없음",
  PENDING: "알림 필요",
  SENDING: "발송 대기",
  SENT: "발송 완료",
  ACKNOWLEDGED: "확인 완료",
  FAILED: "발송 실패",
};

export const eventTypeLabel: Record<DetectionEventType, string> = {
  STABLE: "안정 상태",
  MOVEMENT_INCREASE: "움직임 증가",
  REPEATED_STANDING_ATTEMPT: "반복 기립 시도",
  FALL_RISK: "낙상 위험",
  SOLO_MOVEMENT: "혼자 이동 시도",
  PROLONGED_INACTIVITY: "장시간 미움직임",
  WANDERING: "배회 감지",
  BED_EXIT: "침대 이탈",
  OTHER: "기타 감지",
};

export const actionTypeLabel: Record<ActionType, string> = {
  ACKNOWLEDGED: "확인 완료",
  STAFF_VISIT: "직원 방문 중",
  HELP_REQUEST: "도움 요청",
  NO_ISSUE: "이상 없음",
  GUARDIAN_CONTACT: "보호자 연락",
  HOSPITAL_TRANSFER: "병원 이송",
  MEMO: "기타 메모",
};

export const residentActionLabel: Record<ResidentActionType, string> = {
  CHECKED: "확인함",
  STAFF_VISIT: "직원 방문 중",
  HELP_REQUEST: "도움 요청",
};
