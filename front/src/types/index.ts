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

/**
 * 층/공간/카메라 소유 주체.
 * `EDGE`는 현장 Edge가 토폴로지를 소유·관리하는 행이며, Hub 관리자 화면에서
 * 생성/수정/삭제/이동이 금지된다(백엔드 `assertProductOwned` 가드).
 */
export type ProvisioningSource = "PRODUCT" | "EDGE";

/** 공간의 종합 상태 */
export type SpaceStatusLevel = "STABLE" | "CAUTION" | "DANGER" | "CHECK_NEEDED";

/**
 * 카메라 신선도. 방 위험도(`SpaceStatusLevel`)와 **직교**한다.
 *
 * `SpaceStatusLevel`에 연결 상태를 합치면 실제 `DANGER`가 연결 상태에 덮여
 * 사라진다. 그래서 별도 축으로 둔다.
 */
export type CameraConnection = "LIVE" | "STALE";

/**
 * heartbeat 유효 시간(ms).
 *
 * 엣지 worker가 30초 주기 제한으로 heartbeat를 보내므로(ml-v2
 * `worker/pipeline/ingest/lifecycle.py`), 3분은 6회 연속 누락에 해당해
 * 일시적 네트워크 흔들림을 오판하지 않는다.
 */
export const STALE_CUTOFF_MS = 180_000;

/** 움직임 수준 / 낙상 위험도 공용 3단계 */
export type Level = "LOW" | "MEDIUM" | "HIGH";

/** 알림 발송 상태 */
export type AlertLifecycleStatus =
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
  address: string;
  phone: string;
}

/** 시설 Edge 연결 상태. `NOT_ENROLLED`는 등록된 Edge가 없음, `STALE`은 등록됐지만 heartbeat가 오래됨. */
export type EdgeConnectionState = "NOT_ENROLLED" | "CONNECTED" | "STALE";

/** 시설 관리자 화면에 노출하는 Edge 상태 요약. */
export interface FacilityEdgeStatus {
  connectionState: EdgeConnectionState;
  lastHeartbeatAt: string | null;
  lastSyncedAt: string | null;
  healthyCameraCount: number;
  totalCameraCount: number;
}

export interface Floor {
  id: string;
  facilityId: string;
  name: string; // 예: 2F
  orderIndex: number;
  provisioningSource: ProvisioningSource;
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
  provisioningSource: ProvisioningSource;
}

/** 공간의 현재 상태(가장 최신 1건) */
export interface SpaceStatus {
  id: string;
  spaceId: string;
  peopleCount: number;
  movementLevel: Level;
  fallRiskLevel: Level;
  status: SpaceStatusLevel;
  /**
   * 카메라 신선도. `status`와 직교하며 서로 덮어쓰지 않는다.
   * 판정은 백엔드 `online` 필드가 아니라 `lastSeenAt` 경과시간으로만 한다 —
   * `online`은 `detection-lost` 이벤트로만 false가 되므로 heartbeat가 끊겨도
   * true로 남는다.
   */
  connection: CameraConnection;
  /** 해당 공간 카메라의 마지막 heartbeat 시각(ISO8601). 한 번도 못 봤으면 null. */
  lastSeenAt: string | null;
  aiSummary?: string;
  lastDetectedAt: string; // ISO8601
  alertStatus: AlertLifecycleStatus;
  // 상세 패널용 부가 신호
  bedsideActivity?: boolean; // 침대 주변 활동 여부
  prolongedInactivity?: boolean; // 장시간 미움직임 여부
  soloMovementAttempt?: boolean; // 혼자 이동 시도 여부
  emergency?: boolean; // 응급(낙상/바닥 자세 등) — DANGER 중 최우선
}

export interface DetectionEvent {
  id: string;
  backendEventId?: string | null;
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
  detectedAt: string; // ISO8601
  alertStatus: AlertLifecycleStatus;
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
  emailEnabled: boolean;
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

// ---------- 모니터(현황판) 모드 ----------

export type ConnectionState =
  | "NORMAL" // 정상 연결
  | "RECONNECTING" // 재연결 중
  | "DELAYED" // 데이터 지연
  | "DISCONNECTED"; // 연결 끊김

export type MonitorCardSize = "lg" | "xl";


export interface MonitorSettings {
  defaultFloorId: string; // floorId 또는 "all"
  refreshMs: number; // 자동 갱신 간격
  alertSound: boolean; // 위험 알림음 사용
  cardSize: MonitorCardSize; // 카드 표시 크기
  visibleSpaceIds: string[] | null; // null = 전체 표시
  allowAllView: boolean; // 전체 보기 허용
}
export type AlertStatus = "NEW" | "ACKED" | "RESOLVED";

export interface AlertView {
  alertSeq: string;
  id: string;
  backendEventId: string | null;
  facilityId: string;
  residentId: string | null;
  cameraId: string | null;
  spaceId: string;
  room: string;
  type: string;
  probability: number;
  snapshotKey: string | null;
  detectedAt: string;
  status: AlertStatus;
  ackedById: string | null;
  ackedAt: string | null;
  ackedByName: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  residentName: string | null;
  /** Legacy display compatibility (B1) — derived; never the lifecycle SSOT. */
  alertStatus: AlertLifecycleStatus;
}
