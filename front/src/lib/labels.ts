import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bed,
  Clock,
  Footprints,
  HelpCircle,
  PersonStanding,
  UserRound,
  VideoOff,
} from "lucide-react";
import type {
  ActionType,
  AlertLifecycleStatus,
  DetectionEventType,
  Level,
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

export const alertLabel: Record<AlertLifecycleStatus, string> = {
  NONE: "알림 없음",
  PENDING: "알림 필요",
  SENDING: "발송 대기",
  SENT: "발송 완료",
  ACKNOWLEDGED: "확인 완료",
  FAILED: "발송 실패",
};

const eventTypeLabelRegistry: Record<DetectionEventType, string> = {
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

function unknownEventTypeLabel(type: string): string {
  return type.trim() ? `알 수 없는 이벤트(${type})` : "알 수 없는 이벤트";
}

export const eventTypeLabel = new Proxy(eventTypeLabelRegistry as Record<string, string>, {
  get(target, property) {
    if (typeof property !== "string") return undefined;
    return Object.prototype.hasOwnProperty.call(target, property) ? target[property] : unknownEventTypeLabel(property);
  },
}) as Record<DetectionEventType, string> & Record<string, string>;
export function displayEventTypeLabel(event: {
  eventType: DetectionEventType;
  backendType?: string | null;
}): string {
  if (event.eventType !== "OTHER") return eventTypeLabel[event.eventType];
  if (!event.backendType) return eventTypeLabel[event.eventType];
  // `mapEventType()`(alertEndpoints.ts)는 fall/bed-exit를 뺀 나머지 kebab-case
  // 원문을 전부 OTHER로 뭉갠다. 예전에는 여기서 바로 `eventTypeLabel[backendType]`을
  // 찾았는데, kebab-case 값은 SCREAMING_SNAKE 레지스트리에 없으니 Proxy가
  // unknownEventTypeLabel로 떨어져 "알 수 없는 이벤트(detection-lost)"처럼
  // 원문 wire 문자열을 화면에 그대로 흘렸다. 아래 kebab-case 레지스트리에
  // 등록된 값이면 먼저 그 한글 제목을 쓰고, 정말 어느 쪽에도 없는 값만
  // unknownEventTypeLabel로 넘어가게 한다.
  const presentation = eventPresentationRegistry[event.backendType];
  if (presentation) return presentation.title;
  return eventTypeLabel[event.backendType];
}

/** 알림 화면(console-row 카드)에서 이벤트 유형을 표시하는 방식. */
export interface EventPresentation {
  icon: LucideIcon;
  title: string;
  /** 새로 도착한 카드에 pulse를 줄지 결정하는 심각도. 연결 상태 축과는 별개다. */
  severity: "high" | "medium";
  /** 카드 메타 라인에 붙는 한 줄 설명. */
  phrase: string;
}

const UNKNOWN_EVENT_PRESENTATION: EventPresentation = {
  icon: HelpCircle,
  title: "새 안전 알림",
  severity: "medium",
  phrase: "확인이 필요한 새로운 알림입니다",
};

/**
 * 알림 API의 kebab-case wire 계약(`AlertView.type`, `AlertEventTypes` 등)에
 * 대응하는 표시 정보.
 *
 * 위 `eventTypeLabelRegistry`(SCREAMING_SNAKE_CASE `DetectionEventType` 키,
 * `RoomActionPanel`의 방 단위 이벤트 그룹핑에서 씀)와는 키 체계와 소비처가
 * 다른 별개 레지스트리다 — 두 표기 체계를 섞으면 안 된다. 이쪽은 직원
 * 알림 목록(`AlertsPage`)의 카드가 그대로 실어 나르는 kebab-case 원문
 * 문자열을 키로 쓴다.
 */
const eventPresentationRegistry: Record<string, EventPresentation> = {
  fall: {
    icon: AlertTriangle,
    title: "낙상 감지",
    severity: "high",
    phrase: "바닥에 쓰러진 것으로 보입니다",
  },
  "bed-exit": {
    icon: Bed,
    title: "침대 이탈",
    severity: "high",
    phrase: "침대에서 혼자 벗어났습니다",
  },
  "prolonged-inactivity": {
    icon: Clock,
    title: "장시간 미움직임",
    severity: "medium",
    phrase: "오랫동안 움직임이 없습니다",
  },
  wandering: {
    icon: Footprints,
    title: "배회 감지",
    severity: "medium",
    phrase: "계속 돌아다니고 있습니다",
  },
  "repeated-standing-attempt": {
    icon: PersonStanding,
    title: "반복 기립 시도",
    severity: "medium",
    phrase: "혼자 일어나려는 시도가 반복됩니다",
  },
  "solo-movement": {
    icon: UserRound,
    title: "혼자 이동 시도",
    severity: "medium",
    phrase: "혼자 이동하려 하고 있습니다",
  },
  "detection-lost": {
    icon: VideoOff,
    title: "감지 끊김",
    severity: "medium",
    phrase: "카메라 상태를 확인해주세요",
  },
};

/**
 * 알림 카드의 kebab-case `type` 문자열을 표시 정보로 바꾼다. 등록되지 않은
 * 값은 절대 원문 그대로 화면에 내보내지 않고 안전한 고정 문구로 대체한다 —
 * 직원 화면은 영어/원문 코드를 그대로 노출하지 않는다는 원칙(`staffCopy.ts`)을
 * 이 경로에서도 지킨다.
 */
export function eventPresentationFor(type: string): EventPresentation {
  return eventPresentationRegistry[type] ?? UNKNOWN_EVENT_PRESENTATION;
}

export const actionTypeLabel: Record<ActionType, string> = {
  ACKNOWLEDGED: "확인 완료",
  STAFF_VISIT: "직원 방문 중",
  HELP_REQUEST: "도움 요청",
  NO_ISSUE: "이상 없음",
  GUARDIAN_CONTACT: "보호자 연락",
  HOSPITAL_TRANSFER: "병원 이송",
  MEMO: "기타 메모",
};
