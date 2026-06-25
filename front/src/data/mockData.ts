import type {
  AlertRule,
  DetectionEvent,
  Facility,
  Floor,
  Resident,
  ResidentAssignment,
  ResidentRiskSummary,
  Space,
  SpaceStatus,
  SpaceType,
  User,
  VideoClip,
  Zone,
} from "@/types";

// =============================================================
// 더미 데이터 · 행복한요양원 녹양역점 (실제 시설 구조 기준)
// B1 지하 / 1F(호실 없음) / 2F·3F·4F(각 호실 10 + 복도 3 + 프로그램실 = 14공간)
// 총 54개 공간. 초기 상태는 생성기로 만들고, 실시간 엔진이 시간대에 따라 갱신한다.
// =============================================================

export const NOW_ISO = "2026-06-18T14:11:00+09:00";
const base = new Date(NOW_ISO).getTime();
const minsAgo = (m: number) => new Date(base - m * 60_000).toISOString();
const secsAgo = (s: number) => new Date(base - s * 1000).toISOString();

const FAC = "fac_happy_nokyang";

// ---------- 시설 ----------
export const facilities: Facility[] = [
  {
    id: FAC,
    name: "행복한요양원 녹양역점",
    code: "happy-nokyang",
    address: "경기도 의정부시 녹양로 12",
    phone: "031-123-4567",
  },
  {
    id: "fac_sunny_uijeongbu",
    name: "햇살가득요양원 의정부점",
    code: "sunny-uijeongbu",
    address: "경기도 의정부시 평화로 88",
    phone: "031-987-6543",
  },
];

// ---------- 사용자 ----------
export const users: (User & { password: string })[] = [
  { id: "u_super", name: "통합관리자", email: "super@sen.ai", password: "1234", role: "SUPER_ADMIN", facilityId: null },
  { id: "u_admin", name: "김원장", email: "admin@sen.ai", password: "1234", role: "FACILITY_ADMIN", facilityId: FAC },
  { id: "u_staff", name: "이간호", email: "staff@sen.ai", password: "1234", role: "STAFF", facilityId: FAC },
  { id: "u_viewer", name: "박보호자", email: "viewer@sen.ai", password: "1234", role: "VIEWER", facilityId: FAC },
];

// ---------- 층 ----------
export const floors: Floor[] = [
  { id: "fl_b1", facilityId: FAC, name: "B1", orderIndex: 0 },
  { id: "fl_1f", facilityId: FAC, name: "1F", orderIndex: 1 },
  { id: "fl_2f", facilityId: FAC, name: "2F", orderIndex: 2 },
  { id: "fl_3f", facilityId: FAC, name: "3F", orderIndex: 3 },
  { id: "fl_4f", facilityId: FAC, name: "4F", orderIndex: 4 },
];

// ---------- 공간 ----------
function sp(
  id: string,
  floorId: string,
  name: string,
  type: SpaceType,
  capacity: number,
  assignedStaff: string
): Space {
  return { id, facilityId: FAC, floorId, name, type, capacity, isActive: true, assignedStaff };
}

// 호실 10개 + 공용공간 4개 = 14
function residentialFloor(floorNum: number, staff: string): Space[] {
  const fl = `fl_${floorNum}f`;
  const rooms = Array.from({ length: 10 }, (_, i) => {
    const no = `${floorNum}${String(i + 1).padStart(2, "0")}호`;
    return sp(`sp_${floorNum}${String(i + 1).padStart(2, "0")}`, fl, no, "ROOM", 4, staff);
  });
  return [
    ...rooms,
    sp(`sp_${floorNum}f_hc`, fl, "중앙복도", "HALLWAY", 10, staff),
    sp(`sp_${floorNum}f_hl`, fl, "좌측복도", "HALLWAY", 8, staff),
    sp(`sp_${floorNum}f_hr`, fl, "우측복도", "HALLWAY", 8, staff),
    sp(`sp_${floorNum}f_prog`, fl, "프로그램실", "PROGRAM_ROOM", 20, staff),
  ];
}

export const spaces: Space[] = [
  // B1 지하
  sp("sp_b1_pt", "fl_b1", "물리치료실", "REHAB_ROOM", 8, "정재활"),
  sp("sp_b1_prog", "fl_b1", "프로그램실", "PROGRAM_ROOM", 20, "한복지"),
  sp("sp_b1_dining", "fl_b1", "식당", "DINING", 40, "한복지"),
  sp("sp_b1_hall", "fl_b1", "복도", "HALLWAY", 10, "정재활"),
  sp("sp_b1_store", "fl_b1", "창고", "STORAGE", 2, "관리팀"),
  sp("sp_b1_staff", "fl_b1", "직원휴게공간", "STAFF_LOUNGE", 8, "관리팀"),
  // 1F (호실 없음)
  sp("sp_1f_lobby", "fl_1f", "로비", "LOBBY", 30, "안내데스크"),
  sp("sp_1f_counsel", "fl_1f", "상담실", "OFFICE", 6, "김원장"),
  sp("sp_1f_office", "fl_1f", "사무실", "OFFICE", 6, "관리팀"),
  sp("sp_1f_nurse", "fl_1f", "간호스테이션", "NURSE_STATION", 4, "이간호"),
  sp("sp_1f_hall", "fl_1f", "중앙복도", "HALLWAY", 12, "이간호"),
  sp("sp_1f_entrance", "fl_1f", "출입구", "ENTRANCE", 6, "안내데스크"),
  // 2F / 3F / 4F (각 14공간)
  ...residentialFloor(2, "이간호"),
  ...residentialFloor(3, "최요양"),
  ...residentialFloor(4, "윤케어"),
];

// ---------- 초기 공간 상태 (생성기) ----------
// 대부분 안정. 일부만 주의/위험으로 시작해 다른 화면(직원/관리자)에서도 현장감 유지.
const stableMsgByType: Partial<Record<SpaceType, string>> = {
  ROOM: "현재 안정적인 상태입니다.",
  PROGRAM_ROOM: "프로그램 활동 준비 중입니다.",
  REHAB_ROOM: "현재 이용 인원이 적습니다.",
  DINING: "식사 시간 외 시간입니다.",
  HALLWAY: "통행이 원활합니다.",
  LOBBY: "로비가 안정적으로 유지되고 있습니다.",
  NURSE_STATION: "간호 직원이 상주하고 있습니다.",
};

function initialCount(type: SpaceType): number {
  switch (type) {
    case "ROOM":
      return 2 + (Math.random() < 0.5 ? 1 : 0);
    case "LOBBY":
      return 2;
    case "NURSE_STATION":
      return 1;
    case "HALLWAY":
      return Math.random() < 0.4 ? 1 : 0;
    case "ENTRANCE":
      return 1;
    default:
      return 0;
  }
}

type Override = Partial<Pick<SpaceStatus, "peopleCount" | "movementLevel" | "fallRiskLevel" | "status" | "aiSummary" | "kakaoAlertStatus" | "lastDetectedAt">>;
const overrides: Record<string, Override> = {
  sp_202: { peopleCount: 2, movementLevel: "HIGH", fallRiskLevel: "MEDIUM", status: "CAUTION", aiSummary: "침대 주변 움직임이 많습니다.", kakaoAlertStatus: "PENDING", lastDetectedAt: secsAgo(20) },
  sp_203: { peopleCount: 1, movementLevel: "HIGH", fallRiskLevel: "HIGH", status: "DANGER", aiSummary: "혼자 일어나려는 움직임이 있습니다. 직원 확인 필요", kakaoAlertStatus: "SENT", lastDetectedAt: secsAgo(8) },
  sp_302: { peopleCount: 2, movementLevel: "LOW", fallRiskLevel: "MEDIUM", status: "CHECK_NEEDED", aiSummary: "한동안 움직임이 없습니다.", kakaoAlertStatus: "PENDING", lastDetectedAt: minsAgo(35) },
};

export const spaceStatuses: SpaceStatus[] = spaces.map((s) => {
  const ov = overrides[s.id] ?? {};
  return {
    id: `status_${s.id}`,
    spaceId: s.id,
    peopleCount: ov.peopleCount ?? initialCount(s.type),
    movementLevel: ov.movementLevel ?? "LOW",
    fallRiskLevel: ov.fallRiskLevel ?? "LOW",
    status: ov.status ?? "STABLE",
    aiSummary: ov.aiSummary ?? stableMsgByType[s.type] ?? "현재 안정적인 상태입니다.",
    lastDetectedAt: ov.lastDetectedAt ?? secsAgo(10 + Math.floor(Math.random() * 50)),
    kakaoAlertStatus: ov.kakaoAlertStatus ?? "NONE",
  };
});

// ---------- 감지 이벤트 ----------
export const detectionEvents: DetectionEvent[] = [
  {
    id: "ev_203_fall", facilityId: FAC, spaceId: "sp_203", zoneId: "zone_sp_203_a", zoneName: "침대A", eventType: "FALL_RISK", riskLevel: "HIGH",
    message: "혼자 이동 시도 가능성",
    aiSummary: "203호 침대A에서 어르신이 혼자 일어나 이동을 시도하며 비틀거림 가능성이 감지되었습니다. 직원 확인이 필요합니다.",
    detectedAt: secsAgo(8), kakaoAlertStatus: "SENT", confidence: 0.91, actions: [],
  },
  {
    id: "ev_202_stand", facilityId: FAC, spaceId: "sp_202", zoneId: "zone_sp_202_a", zoneName: "침대A", eventType: "REPEATED_STANDING_ATTEMPT", riskLevel: "MEDIUM",
    message: "침대 주변 반복 기립 시도",
    aiSummary: "202호 침대A 주변에서 반복적인 기립 시도가 감지되었습니다. 직원 확인이 권장됩니다.",
    detectedAt: minsAgo(0), kakaoAlertStatus: "SENT", confidence: 0.87, actions: [],
  },
  {
    id: "ev_302_inactive", facilityId: FAC, spaceId: "sp_302", eventType: "PROLONGED_INACTIVITY", riskLevel: "MEDIUM",
    message: "장시간 미움직임",
    aiSummary: "302호에서 약 35분간 움직임이 감지되지 않았습니다. 안전 확인을 위해 직원 방문이 권장됩니다.",
    detectedAt: minsAgo(5), kakaoAlertStatus: "PENDING", confidence: 0.78, actions: [],
  },
  {
    id: "ev_2fhc_walk", facilityId: FAC, spaceId: "sp_2f_hc", eventType: "WANDERING", riskLevel: "MEDIUM",
    message: "복도 느린 보행 감지",
    aiSummary: "2F 중앙복도에서 느린 보행이 감지되었습니다. 경과를 지켜볼 필요가 있습니다.",
    detectedAt: minsAgo(8), kakaoAlertStatus: "PENDING", confidence: 0.72, actions: [],
  },
  {
    id: "ev_201_resolved", facilityId: FAC, spaceId: "sp_201", eventType: "MOVEMENT_INCREASE", riskLevel: "LOW",
    message: "움직임 증가 후 안정화",
    aiSummary: "201호에서 일시적으로 움직임이 증가했으나 현재 안정 상태로 회복되었습니다.",
    detectedAt: minsAgo(48), kakaoAlertStatus: "ACKNOWLEDGED", acknowledgedBy: "이간호", acknowledgedAt: minsAgo(45),
    confidence: 0.69,
    actions: [
      { id: "act_1", type: "STAFF_VISIT", note: "직접 방문하여 상태 확인, 이상 없음.", createdBy: "이간호", createdAt: minsAgo(45) },
      { id: "act_2", type: "NO_ISSUE", createdBy: "이간호", createdAt: minsAgo(45) },
    ],
  },
];

// 202호 상세 타임라인 예시
export const sampleTimeline: DetectionEvent[] = [
  { id: "tl_1", facilityId: FAC, spaceId: "sp_202", eventType: "STABLE", riskLevel: "LOW", message: "안정 상태", aiSummary: "안정 상태로 모니터링 중입니다.", detectedAt: minsAgo(10), kakaoAlertStatus: "NONE", actions: [] },
  { id: "tl_2", facilityId: FAC, spaceId: "sp_202", eventType: "MOVEMENT_INCREASE", riskLevel: "LOW", message: "침대 주변 움직임 증가", aiSummary: "침대 주변 움직임이 증가하기 시작했습니다.", detectedAt: minsAgo(3), kakaoAlertStatus: "NONE", actions: [] },
  { id: "tl_3", facilityId: FAC, spaceId: "sp_202", eventType: "FALL_RISK", riskLevel: "MEDIUM", message: "낙상 위험 중간", aiSummary: "반복 기립 시도로 낙상 위험도가 중간으로 상향되었습니다.", detectedAt: minsAgo(1), kakaoAlertStatus: "NONE", actions: [] },
  { id: "tl_4", facilityId: FAC, spaceId: "sp_202", eventType: "REPEATED_STANDING_ATTEMPT", riskLevel: "MEDIUM", message: "카카오톡 알림 발송", aiSummary: "알림 규칙에 따라 담당 직원에게 카카오톡 알림이 발송되었습니다.", detectedAt: minsAgo(0), kakaoAlertStatus: "SENT", actions: [] },
];

// ---------- 영상 클립 (이슈 근거, 관리자 전용) ----------
function clip(id: string, eventId: string, spaceId: string, cameraId: string, detectedAt: string, storageStatus: VideoClip["storageStatus"] = "AVAILABLE"): VideoClip {
  const t = new Date(detectedAt).getTime();
  return {
    id, eventId, facilityId: FAC, spaceId, cameraId,
    clipUrl: `s3://senai-clips/${FAC}/${eventId}.mp4`,
    thumbnailUrl: `s3://senai-clips/${FAC}/${eventId}.jpg`,
    detectedAt,
    clipStartAt: new Date(t - 10_000).toISOString(),
    clipEndAt: new Date(t + 10_000).toISOString(),
    durationSeconds: 20,
    storageStatus, accessLevel: "ADMIN_ONLY",
    expiresAt: new Date(t + 30 * 24 * 3600_000).toISOString(),
    createdAt: new Date(t + 12_000).toISOString(),
  };
}

export const videoClips: VideoClip[] = [
  clip("clip_203", "ev_203_fall", "sp_203", "CAM-2F-203", secsAgo(8)),
  clip("clip_202", "ev_202_stand", "sp_202", "CAM-2F-202", minsAgo(0)),
  clip("clip_302", "ev_302_inactive", "sp_302", "CAM-3F-302", minsAgo(5), "PROCESSING"),
];

// ---------- 구역/침대 (Zone) ----------
// 모든 호실(ROOM)에 침대A·침대B 2개를 둔다. (PoC 기본 구성)
export const zones: Zone[] = spaces
  .filter((s) => s.type === "ROOM")
  .flatMap((s) => [
    { id: `zone_${s.id}_a`, facilityId: FAC, spaceId: s.id, name: "침대A", type: "BED" as const, orderIndex: 0 },
    { id: `zone_${s.id}_b`, facilityId: FAC, spaceId: s.id, name: "침대B", type: "BED" as const, orderIndex: 1 },
  ]);

// ---------- 어르신 배정 (ResidentAssignment) ----------
function assign(residentId: string, spaceId: string, bed: "a" | "b"): ResidentAssignment {
  return {
    id: `asg_${residentId}`,
    facilityId: FAC,
    residentId,
    spaceId,
    zoneId: `zone_${spaceId}_${bed}`,
    active: true,
    startedAt: "2026-01-02T09:00:00+09:00",
  };
}
export const residentAssignments: ResidentAssignment[] = [
  assign("res_kim", "sp_202", "a"),
  assign("res_lee", "sp_203", "a"),
  assign("res_park", "sp_401", "a"),
  assign("res_choi", "sp_301", "a"),
  assign("res_jung", "sp_305", "a"),
];

// ---------- 관심 어르신 (Focus Resident) ----------
const TODAY = "2026-06-18";
const YESTERDAY = "2026-06-17";

export const residents: Resident[] = [
  { id: "res_kim", facilityId: FAC, roomId: "sp_202", name: "김○○", gender: "F", age: 82, diagnosisTags: ["파킨슨", "치매"], fallRiskBaseline: "HIGH", isFocusResident: true },
  { id: "res_lee", facilityId: FAC, roomId: "sp_203", name: "이○○", gender: "F", age: 79, diagnosisTags: ["치매"], fallRiskBaseline: "MEDIUM", isFocusResident: true },
  { id: "res_park", facilityId: FAC, roomId: "sp_401", name: "박○○", gender: "M", age: 85, diagnosisTags: ["보행 불안정"], fallRiskBaseline: "MEDIUM", isFocusResident: true },
  // 비대상(평상시) 어르신 예시
  { id: "res_choi", facilityId: FAC, roomId: "sp_301", name: "최○○", gender: "F", age: 77, diagnosisTags: ["고혈압"], fallRiskBaseline: "LOW", isFocusResident: false },
  { id: "res_jung", facilityId: FAC, roomId: "sp_305", name: "정○○", gender: "M", age: 81, diagnosisTags: ["당뇨"], fallRiskBaseline: "LOW", isFocusResident: false },
];

function summary(
  residentId: string,
  date: string,
  d: Partial<ResidentRiskSummary> & { fallRiskScore: number; riskLevel: ResidentRiskSummary["riskLevel"]; aiSummary: string; recommendedAction: string }
): ResidentRiskSummary {
  return {
    id: `rrs_${residentId}_${date}`,
    residentId,
    date,
    bedExitCount: 0,
    wanderingCount: 0,
    standingAttemptCount: 0,
    hallwayMoveCount: 0,
    longInactivityCount: 0,
    ...d,
  };
}

export const residentRiskSummaries: ResidentRiskSummary[] = [
  // 오늘
  summary("res_kim", TODAY, { bedExitCount: 3, standingAttemptCount: 2, hallwayMoveCount: 1, fallRiskScore: 82, riskLevel: "HIGH", aiSummary: "야간 침상 이탈이 반복되고 움직임이 늘었습니다.", recommendedAction: "취침 시간대에 더 자주 확인해주세요." }),
  summary("res_lee", TODAY, { wanderingCount: 2, hallwayMoveCount: 1, fallRiskScore: 58, riskLevel: "MEDIUM", aiSummary: "배회가 늘고 복도 단독 이동이 있었습니다.", recommendedAction: "복도 이동 시 동행을 권장합니다." }),
  summary("res_park", TODAY, { standingAttemptCount: 4, fallRiskScore: 61, riskLevel: "MEDIUM", aiSummary: "반복적인 기립 시도와 침대 주변 움직임이 늘었습니다.", recommendedAction: "기립 시 도움이 필요할 수 있습니다." }),
  // 전일(증감 비교용)
  summary("res_kim", YESTERDAY, { bedExitCount: 1, standingAttemptCount: 1, fallRiskScore: 64, riskLevel: "MEDIUM", aiSummary: "야간 움직임이 다소 있었습니다.", recommendedAction: "경과 관찰" }),
  summary("res_lee", YESTERDAY, { wanderingCount: 1, fallRiskScore: 50, riskLevel: "MEDIUM", aiSummary: "가벼운 배회가 있었습니다.", recommendedAction: "경과 관찰" }),
  summary("res_park", YESTERDAY, { standingAttemptCount: 2, fallRiskScore: 55, riskLevel: "MEDIUM", aiSummary: "기립 시도가 있었습니다.", recommendedAction: "경과 관찰" }),
];

// ---------- 알림 규칙 ----------
export const alertRules: AlertRule[] = [
  { id: "rule_default", facilityId: FAC, spaceId: null, minRiskLevel: "MEDIUM", kakaoEnabled: true, recipients: ["이간호 (010-1111-2222)", "김원장 (010-3333-4444)"], dayModeEnabled: true, nightModeEnabled: true, sensitivity: "MEDIUM" },
  { id: "rule_203", facilityId: FAC, spaceId: "sp_203", minRiskLevel: "MEDIUM", kakaoEnabled: true, recipients: ["이간호 (010-1111-2222)"], dayModeEnabled: true, nightModeEnabled: true, sensitivity: "HIGH" },
];
