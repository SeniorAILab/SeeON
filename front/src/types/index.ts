// =============================================================
// Senior AI Lab · 도메인 타입 정의
// 백엔드/AI 모델 연동 시 그대로 공유 가능한 단일 소스 오브 트루스
// =============================================================

// ---------- 열거형(Enum) ----------

export type Role = "SUPER_ADMIN" | "FACILITY_ADMIN" | "STAFF" | "VIEWER";
export type BackendRole = "SUPER_ADMIN" | "ADMIN" | "CAREGIVER";

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
  cameraId: string | null; // 예: CAM-2F-201, 미배정 시 null
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
  | "VISIT_PLANNED" // 방문 예정
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

// ---------- 영상(이슈 근거 클립) ----------
// 정책: 실시간 CCTV 스트리밍이 아니라, AI가 위험으로 감지한 이벤트 구간의
//       짧은 클립(감지 10초 전 ~ 10초 후, 20~30초)만 관리자에게 제공.

export type VideoStorageStatus =
  | "PROCESSING" // 클립 생성 중
  | "AVAILABLE" // 조회 가능
  | "EXPIRED" // 보관기간 만료
  | "DELETED"; // 자동 삭제됨

export type VideoAccessLevel = "ADMIN_ONLY";

export type VideoAccessAction =
  | "VIEW" // 상세 진입(메타 조회)
  | "PLAY" // 재생
  | "FULLSCREEN" // 전체화면
  | "DOWNLOAD_BLOCKED"; // 다운로드 시도(차단됨)

export interface VideoClip {
  id: string;
  eventId: string;
  facilityId: string;
  spaceId: string;
  cameraId: string;
  clipUrl: string; // 직접 노출 금지 — signed URL 발급 후에만 사용
  thumbnailUrl: string;
  detectedAt: string;
  clipStartAt: string; // 감지 10초 전
  clipEndAt: string; // 감지 10초 후
  durationSeconds: number;
  storageStatus: VideoStorageStatus;
  accessLevel: VideoAccessLevel;
  expiresAt: string; // 보관기간/자동삭제 기준
  createdAt: string;
}

export interface VideoAccessLog {
  id: string;
  videoClipId: string;
  userId: string;
  userName: string;
  facilityId: string;
  action: VideoAccessAction;
  accessedAt: string;
  ipAddress: string;
  userAgent: string;
}

/** signed URL 발급 응답 */
export interface SignedVideoUrl {
  url: string;
  expiresAt: string;
}

// ---------- API 합성 응답 ----------

/** 대시보드 한 화면을 그리기 위한 합성 응답 */
export interface DashboardResponse {
  facility: Facility;
  floors: Floor[];
  spaces: Space[];
  statuses: Record<string, SpaceStatus>; // key = spaceId
  summary: DashboardSummary;
  unacknowledgedEvents: DetectionEvent[];
}

export interface DashboardSummary {
  totalSpaces: number;
  stable: number;
  caution: number;
  danger: number;
  checkNeeded: number;
  unacknowledged: number;
}

/** AI 모델이 백엔드로 전송하는 페이로드(연동 지점) */
export interface AIDetectionPayload {
  facilityCode: string;
  cameraId: string;
  spaceId: string;
  timestamp: string;
  peopleCount: number;
  movementLevel: Level;
  fallRiskLevel: Level;
  eventType: DetectionEventType;
  aiSummary: string;
  confidence: number;
}

export interface AuthSession {
  user: User;
  token: string;
}

// ---------- 모니터(현황판) 모드 ----------

export type ConnectionState =
  | "NORMAL" // 정상 연결
  | "RECONNECTING" // 재연결 중
  | "DELAYED" // 데이터 지연
  | "DISCONNECTED"; // 연결 끊김

export type MonitorCardSize = "lg" | "xl";

/** 데모/시연용 시간대 강제 모드 (AUTO = 실제 시각 기반) */
export type DemoMode =
  | "AUTO"
  | "NORMAL" // 평상시(휴식)
  | "MEAL" // 식사 시간
  | "PROGRAM" // 프로그램 시간
  | "BEDTIME" // 취침 준비
  | "NIGHT" // 야간
  | "RISK_DEMO"; // 위험 이벤트 데모(자주 발생)

export interface MonitorSettings {
  defaultFloorId: string; // floorId 또는 "all"
  refreshMs: number; // 자동 갱신 간격
  alertSound: boolean; // 위험 알림음 사용
  nightMode: boolean; // 야간(다크) 모드
  cardSize: MonitorCardSize; // 카드 표시 크기
  visibleSpaceIds: string[] | null; // null = 전체 표시
  allowAllView: boolean; // 전체 보기 허용
  demoMode: DemoMode; // 시연용 시간대 강제
}
