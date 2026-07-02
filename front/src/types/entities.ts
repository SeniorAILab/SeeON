// ---------- 열거형(Enum) ----------

export type Role = "SUPER_ADMIN" | "ADMIN" | "STAFF";

export type SpaceType =
  | "ROOM"
  | "HALLWAY"
  | "PROGRAM_ROOM"
  | "REHAB_ROOM"
  | "DINING" // 식당
  | "LOBBY"
  | "OFFICE"
  | "NURSE_STATION" // 간호스테이션
  | "ENTRANCE" // 출입구
  | "STORAGE" // 창고
  | "STAFF_LOUNGE" // 직원휴게공간
  | "ETC";

/** 공간의 종합 상태 */
export type SpaceStatusLevel = "STABLE" | "CAUTION" | "DANGER" | "CHECK_NEEDED";

/** 움직임 수준 / 낙상 위험도 공용 3단계 */
export type Level = "LOW" | "MEDIUM" | "HIGH";

/** 카카오톡 알림 발송 상태 */
export type KakaoAlertStatus =
  | "NONE" // 알림 불필요
  | "PENDING" // 알림 필요(발송 대기)
  | "SENDING" // 발송 처리 중
  | "SENT" // 발송 완료
  | "ACKNOWLEDGED" // 직원 확인 완료
  | "FAILED"; // 발송 실패

export type DetectionEventType =
  | "STABLE"
  | "MOVEMENT_INCREASE"
  | "REPEATED_STANDING_ATTEMPT"
  | "FALL_RISK"
  | "SOLO_MOVEMENT"
  | "PROLONGED_INACTIVITY"
  | "WANDERING"
  | "BED_EXIT"
  | "OTHER";

export type ActionType =
  | "ACKNOWLEDGED" // 확인 완료
  | "STAFF_VISIT" // 직원 방문 중
  | "HELP_REQUEST" // 도움 요청
  | "NO_ISSUE" // 이상 없음
  | "GUARDIAN_CONTACT" // 보호자 연락
  | "HOSPITAL_TRANSFER" // 병원 이송
  | "MEMO"; // 기타 메모

// ---------- 엔티티 ----------

export interface Facility {
  id: string;
  name: string;
  code: string; // 예: happy-nokyang
  address: string;
  phone: string;
}

export interface Floor {
  id: string;
  facilityId: string;
  name: string; // 예: 2F
  orderIndex: number;
}

export interface Space {
  id: string;
  facilityId: string;
  floorId: string;
  name: string; // 예: 201호
  type: SpaceType;
  capacity: number;
  isActive: boolean;
  assignedStaff?: string; // 담당 직원
}

/** 공간 내 세부 구역(침대/구역). 얼굴 인식 없이 "어느 구역인지"만 다룬다. */
export type ZoneType = "BED" | "AREA";
export interface Zone {
  id: string;
  facilityId: string;
  spaceId: string;
  name: string; // 예: 침대A, 창측 구역
  type: ZoneType;
  orderIndex: number;
}

/** 어르신 ↔ 공간/구역 배정. 개인 매핑은 요양원 DB(여기)에서만 관리. */
export interface ResidentAssignment {
  id: string;
  facilityId: string;
  residentId: string;
  spaceId: string;
  zoneId: string | null; // 침대/구역 (null = 공간만)
  active: boolean;
  startedAt: string;
}

/** 공간의 현재 상태(가장 최신 1건) */
export interface SpaceStatus {
  id: string;
  spaceId: string;
  peopleCount: number;
  movementLevel: Level;
  fallRiskLevel: Level;
  status: SpaceStatusLevel;
  aiSummary: string;
  lastDetectedAt: string; // ISO8601
  kakaoAlertStatus: KakaoAlertStatus;
  // 상세 패널용 부가 신호
  bedsideActivity?: boolean; // 침대 주변 활동 여부
  prolongedInactivity?: boolean; // 장시간 미움직임 여부
  soloMovementAttempt?: boolean; // 혼자 이동 시도 여부
  emergency?: boolean; // 응급(낙상/바닥 자세 등) — DANGER 중 최우선
}

export interface DetectionEvent {
  id: string;
  facilityId: string;
  spaceId: string;
  alertSeq?: string; // backend causal sequence for dashboard-stream merge
  residentId?: string | null; // null = room/space-level alert
  cameraId?: string | null;
  room?: string;
  eventType: DetectionEventType;
  riskLevel: Level;
  message: string;
  aiSummary: string;
  zoneId?: string; // 발생 구역(침대) — 있으면 "202호 침대A" 표기
  zoneName?: string;
  detectedAt: string; // ISO8601
  kakaoAlertStatus: KakaoAlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  actions: ActionLog[];
  confidence?: number; // AI 모델 신뢰도 (0~1)
  emergency?: boolean; // 응급 이벤트
}

export interface ActionLog {
  id: string;
  type: ActionType;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  facilityId: string;
  spaceId: string | null; // null = 시설 전체 기본 규칙
  minRiskLevel: Level; // 이 위험도 이상이면 알림
  kakaoEnabled: boolean;
  recipients: string[]; // 수신 대상(이름 또는 연락처)
  dayModeEnabled: boolean;
  nightModeEnabled: boolean;
  sensitivity: Level; // 공간별 알림 민감도
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  facilityId: string | null; // SUPER_ADMIN 은 null 가능(전체)
}

export interface AuthSession {
  user: User;
}

// ---------- 관심 어르신 (Focus Resident) ----------
// "감시 대상"이 아니라 "오늘 더 자주 확인할 어르신"을 돕기 위한 정보.

export interface Resident {
  id: string;
  facilityId: string;
  roomId: string; // Space id (호실)
  name: string; // 개인정보 보호를 위해 마스킹 표기 (예: 김○○)
  gender: "M" | "F";
  age: number;
  diagnosisTags: string[]; // 예: ["파킨슨", "치매"]
  fallRiskBaseline: Level; // 평소 낙상 위험 기준선
  isFocusResident: boolean; // 오늘 집중 관찰 대상 여부
}

export type ResidentActionType =
  | "CHECKED" // 확인함
  | "STAFF_VISIT" // 직원 방문 중
  | "HELP_REQUEST"; // 도움 요청

export interface ResidentAction {
  id: string;
  residentId: string;
  type: ResidentActionType;
  createdBy: string;
  createdAt: string;
}

export interface ResidentRiskSummary {
  id: string;
  residentId: string;
  date: string; // YYYY-MM-DD
  bedExitCount: number; // 침상 이탈
  wanderingCount: number; // 배회
  standingAttemptCount: number; // 반복 기립 시도
  hallwayMoveCount: number; // 복도 단독 이동
  longInactivityCount: number; // 장시간 미움직임
  fallRiskScore: number; // 0~100 (관리자용)
  riskLevel: Level;
  aiSummary: string; // 직원이 이해하기 쉬운 한 줄
  recommendedAction: string; // 권장 조치
}

/** 화면 표시용 합성 */
export interface FocusResidentView {
  resident: Resident;
  room?: Space;
  bedName?: string; // 배정된 침대(구역)
  today: ResidentRiskSummary;
  yesterday?: ResidentRiskSummary;
  lastAction?: ResidentAction;
}
