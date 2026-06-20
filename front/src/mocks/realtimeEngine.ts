// =============================================================
// Mock 실시간 엔진 (현실형)
// 완전 랜덤이 아니라 "시간대 생활 패턴 + 공간 유형 + 이전 상태"를 반영한다.
//   · 안정이 기본. 위험은 드물게(데모 기준 약 2~3분에 1회), 발생하면 일정 시간 유지.
//   · 인원 수는 목표치를 향해 ±1씩 점진 변화(0→8 같은 급변 방지).
//   · 프로그램실/식당/물리치료실의 활발한 움직임은 위험으로 오인하지 않는다.
//   · 야간 복도 단독 이동, 호실 단독 기립 등 특정 상황에서만 위험을 생성.
//
// ★ 실제 연동: 이 엔진을 WebSocket/SSE/polling 으로 교체.
//   subscribe()/getSnapshot() 인터페이스 유지 시 UI 변경 불필요.
// =============================================================
import { db } from "@/services/db";
import { uid } from "@/lib/utils";
import type {
  ConnectionState,
  DemoMode,
  DetectionEvent,
  Level,
  Space,
  SpaceStatus,
  SpaceStatusLevel,
} from "@/types";

export interface EngineSnapshot {
  statuses: Record<string, SpaceStatus>;
  connection: ConnectionState;
  lastUpdateAt: string;
}
type Listener = (snap: EngineSnapshot) => void;

type DayPart =
  | "EARLY_MORNING" // 06:00~08:30 기상
  | "BREAKFAST" // 08:30~09:30 아침식사 이동
  | "MORNING_PROGRAM" // 09:30~11:30 프로그램/재활
  | "LUNCH" // 11:30~13:00 점심
  | "REST" // 13:00~15:00 휴식
  | "AFTERNOON_PROGRAM" // 15:00~16:30 오후 프로그램/간식
  | "DINNER" // 16:30~19:00 저녁식사
  | "BEDTIME" // 19:00~22:00 취침 준비
  | "NIGHT"; // 22:00~06:00 야간

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));

const isMeal = (d: DayPart) => d === "BREAKFAST" || d === "LUNCH" || d === "DINNER";
const isProgram = (d: DayPart) => d === "MORNING_PROGRAM" || d === "AFTERNOON_PROGRAM";
const isBedMovement = (d: DayPart) => d === "EARLY_MORNING" || d === "BEDTIME";

function resolveDayPart(now: Date, demo: DemoMode): DayPart {
  switch (demo) {
    case "NORMAL":
      return "REST";
    case "MEAL":
      return "DINNER";
    case "PROGRAM":
      return "MORNING_PROGRAM";
    case "BEDTIME":
      return "BEDTIME";
    case "NIGHT":
      return "NIGHT";
    default:
      break; // AUTO / RISK_DEMO → 실제 시각
  }
  const m = now.getHours() * 60 + now.getMinutes();
  if (m >= 360 && m < 510) return "EARLY_MORNING";
  if (m >= 510 && m < 570) return "BREAKFAST";
  if (m >= 570 && m < 690) return "MORNING_PROGRAM";
  if (m >= 690 && m < 780) return "LUNCH";
  if (m >= 780 && m < 900) return "REST";
  if (m >= 900 && m < 990) return "AFTERNOON_PROGRAM";
  if (m >= 990 && m < 1140) return "DINNER";
  if (m >= 1140 && m < 1320) return "BEDTIME";
  return "NIGHT";
}

// 공간 유형 + 시간대별 목표 인원 범위
function occupancyRange(type: Space["type"], d: DayPart): [number, number] {
  switch (type) {
    case "ROOM":
      if (isMeal(d) || isProgram(d)) return [0, 2];
      if (d === "REST" || d === "NIGHT" || d === "BEDTIME") return [2, 4];
      if (d === "EARLY_MORNING") return [1, 3];
      return [1, 3];
    case "PROGRAM_ROOM":
      if (isProgram(d)) return [6, 15];
      if (d === "LUNCH" || d === "BREAKFAST") return [2, 6];
      return [0, 3];
    case "REHAB_ROOM":
      if (d === "MORNING_PROGRAM") return [2, 8];
      if (d === "AFTERNOON_PROGRAM") return [1, 5];
      return [0, 2];
    case "DINING":
      if (isMeal(d)) return [8, 20];
      return [0, 2];
    case "HALLWAY":
      if (isMeal(d)) return [3, 8];
      if (isProgram(d)) return [2, 5];
      if (d === "NIGHT") return [0, 1];
      if (d === "EARLY_MORNING") return [1, 4];
      return [0, 3];
    case "LOBBY":
      return d === "NIGHT" ? [0, 1] : [0, 5];
    case "NURSE_STATION":
      return [1, 2];
    case "ENTRANCE":
      return d === "NIGHT" ? [0, 1] : [0, 3];
    case "STAFF_LOUNGE":
      return [0, 3];
    case "STORAGE":
      return [0, 1];
    default:
      return [0, 2];
  }
}

// 활동이 정상인(움직임 많아도 위험 아님) 공간
const activityType = (t: Space["type"]) =>
  t === "PROGRAM_ROOM" || t === "REHAB_ROOM" || t === "DINING";

const movementByStatus: Record<SpaceStatusLevel, Level> = {
  STABLE: "LOW",
  CAUTION: "MEDIUM",
  DANGER: "HIGH",
  CHECK_NEEDED: "LOW",
};
const fallByStatus: Record<SpaceStatusLevel, Level> = {
  STABLE: "LOW",
  CAUTION: "MEDIUM",
  DANGER: "HIGH",
  CHECK_NEEDED: "MEDIUM",
};

interface Runtime {
  target: number;
  holdUntil: number;
  highRisk: boolean;
}

class RealtimeEngine {
  private statuses: Record<string, SpaceStatus> = {};
  private rt: Record<string, Runtime> = {};
  private eventBySpace: Record<string, string> = {};
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private connection: ConnectionState = "NORMAL";
  private lastUpdateAt = new Date().toISOString();
  private facilityId = "";
  private intervalMs = 6000;
  private demo: DemoMode = "AUTO";
  private profile: "DEFAULT" | "POC_2F" = "DEFAULT";
  private lastDayPart: DayPart | null = null;
  private lastDangerAt = 0;
  private started = false;

  start(facilityId: string, intervalMs = 6000) {
    this.intervalMs = intervalMs;
    if (this.started && this.facilityId === facilityId) {
      this.reschedule();
      return;
    }
    this.facilityId = facilityId;
    this.seed(facilityId);
    this.started = true;
    this.reschedule();
    this.emit();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }
  setInterval(ms: number) {
    this.intervalMs = ms;
    if (this.started) this.reschedule();
  }
  setDemoMode(mode: DemoMode) {
    this.demo = mode;
    this.lastDayPart = null; // 시간대 강제 변경 → 목표 인원 재샘플 유도
  }
  /** UX 검증용 프로파일: POC_2F = 알림 빈도를 현실적으로 낮춤 */
  setProfile(p: "DEFAULT" | "POC_2F") {
    this.profile = p;
  }

  /** 수동 위험/응급 트리거 (응급은 데모/테스트 버튼에서만) */
  trigger(spaceId: string, emergency: boolean) {
    const space = this.space(spaceId);
    const st = this.statuses[spaceId];
    if (!space || !st || !this.rt[spaceId]) return;
    const nowIso = new Date().toISOString();
    const msg = emergency
      ? "바닥에 쓰러진 자세가 감지되었습니다. 즉시 확인해주세요."
      : this.message("DANGER", space, resolveDayPart(new Date(), this.demo));
    this.createDangerEvent(space, msg, nowIso, emergency);
    this.statuses[spaceId] = {
      ...st,
      status: "DANGER",
      movementLevel: "HIGH",
      fallRiskLevel: "HIGH",
      aiSummary: `${space.name} ${msg}`,
      kakaoAlertStatus: "SENT",
      lastDetectedAt: nowIso,
      emergency: emergency ? true : undefined,
    };
    this.rt[spaceId].holdUntil = Number.MAX_SAFE_INTEGER;
    this.lastDangerAt = Date.now();
    this.emit();
  }
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.getSnapshot());
    return () => this.listeners.delete(l);
  }
  getSnapshot(): EngineSnapshot {
    return { statuses: { ...this.statuses }, connection: this.connection, lastUpdateAt: this.lastUpdateAt };
  }

  acknowledge(spaceId: string) {
    const st = this.statuses[spaceId];
    if (!st) return;
    this.statuses[spaceId] = {
      ...st,
      status: "STABLE",
      movementLevel: "LOW",
      fallRiskLevel: "LOW",
      aiSummary: "직원 확인 후 안정 상태로 회복되었습니다.",
      kakaoAlertStatus: "ACKNOWLEDGED",
      lastDetectedAt: new Date().toISOString(),
      emergency: undefined,
    };
    if (this.rt[spaceId]) this.rt[spaceId].holdUntil = Date.now() + 45_000;
    const evId = this.eventBySpace[spaceId];
    if (evId) {
      const ev = db.events.find((e) => e.id === evId);
      if (ev) {
        ev.kakaoAlertStatus = "ACKNOWLEDGED";
        ev.acknowledgedAt = new Date().toISOString();
      }
      delete this.eventBySpace[spaceId];
    }
    this.emit();
  }

  // ---------- 내부 ----------
  private seed(facilityId: string) {
    const facSpaces = db.spaces.filter((s) => s.facilityId === facilityId);
    const ids = new Set(facSpaces.map((s) => s.id));
    this.statuses = {};
    this.rt = {};
    const dp = resolveDayPart(new Date(), this.demo);
    for (const st of db.statuses) {
      if (!ids.has(st.spaceId)) continue;
      this.statuses[st.spaceId] = { ...st };
      const space = facSpaces.find((s) => s.id === st.spaceId)!;
      const [lo, hi] = occupancyRange(space.type, dp);
      this.rt[st.spaceId] = {
        target: randInt(lo, hi),
        holdUntil: 0,
        // 일부 호실을 낙상 고위험으로 지정(위험이 이 공간에 더 잘 발생)
        highRisk: ["sp_203", "sp_208", "sp_305", "sp_409"].includes(st.spaceId),
      };
    }
    this.lastDayPart = dp;
  }

  private reschedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  private space(id: string): Space | undefined {
    return db.spaces.find((s) => s.id === id);
  }
  private activeDanger(): number {
    return Object.values(this.statuses).filter((s) => s.status === "DANGER").length;
  }
  private canSpawnDanger(now: number): boolean {
    const minGap =
      this.demo === "RISK_DEMO" ? 20_000 : this.profile === "POC_2F" ? 300_000 : 110_000;
    return this.activeDanger() < 1 && now - this.lastDangerAt > minGap;
  }

  private tick() {
    const nowDate = new Date();
    const now = nowDate.getTime();
    const nowIso = nowDate.toISOString();
    const dp = resolveDayPart(nowDate, this.demo);

    // 연결 상태(대부분 정상). 지연/재연결이면 이번 틱은 데이터 갱신 생략.
    const cr = Math.random();
    this.connection = cr < 0.02 ? "DELAYED" : cr < 0.025 ? "RECONNECTING" : "NORMAL";
    if (this.connection !== "NORMAL") {
      this.lastUpdateAt = nowIso;
      this.emit();
      return;
    }

    const dayPartChanged = dp !== this.lastDayPart;
    this.lastDayPart = dp;

    for (const id of Object.keys(this.statuses)) {
      const space = this.space(id);
      if (!space) continue;
      const rt = this.rt[id];

      // 시간대 변경 시 목표 인원 재샘플(점진 이동으로 자연스럽게 채워짐/비워짐)
      if (dayPartChanged || Math.random() < 0.05) {
        const [lo, hi] = occupancyRange(space.type, dp);
        rt.target = randInt(lo, hi);
      }
      this.driftPeople(id, space);

      // 상태 유지 시간 내: 상태 유지 + 감지시각만 갱신
      if (rt.holdUntil > now) {
        this.statuses[id] = { ...this.statuses[id], lastDetectedAt: nowIso };
        continue;
      }

      this.reevaluate(id, space, dp, now, nowIso);
    }

    this.lastUpdateAt = nowIso;
    this.emit();
  }

  private driftPeople(id: string, space: Space) {
    const rt = this.rt[id];
    const st = this.statuses[id];
    let count = st.peopleCount;
    if (Math.random() < 0.45 && count !== rt.target) {
      count += count < rt.target ? 1 : -1;
    }
    count = Math.max(0, Math.min(space.capacity, count));
    if (count !== st.peopleCount) this.statuses[id] = { ...st, peopleCount: count };
  }

  private reevaluate(id: string, space: Space, dp: DayPart, now: number, nowIso: string) {
    const st = this.statuses[id];
    const next = this.rollStatus(space, dp, now, this.rt[id].highRisk);
    if (next === st.status && next === "STABLE") {
      // 안정 유지 — 가끔 메시지/감지시각만 갱신
      if (Math.random() < 0.5) {
        this.statuses[id] = { ...st, aiSummary: this.message("STABLE", space, dp), lastDetectedAt: nowIso };
      }
      this.rt[id].holdUntil = now + rnd(30_000, 180_000);
      return;
    }
    this.applyStatus(id, space, next, dp, now, nowIso);
  }

  /** 시간대·유형 기반 다음 상태 결정 */
  private rollStatus(space: Space, dp: DayPart, now: number, highRisk: boolean): SpaceStatusLevel {
    const r = Math.random();
    // UX 검증(POC_2F)에서는 이벤트 빈도를 현실적으로 낮춘다(피로감 방지)
    const calm = this.profile === "POC_2F" ? 0.4 : 1;

    // 활동 공간: 활동 시간엔 움직임 많아도 항상 안정
    if (activityType(space.type)) return "STABLE";

    if (space.type === "ROOM") {
      let caution = 0.1 * calm;
      let danger = 0.02 * calm;
      let check = 0.04 * calm;
      if (isBedMovement(dp)) {
        caution = 0.22;
        danger = 0.06;
      } else if (dp === "NIGHT") {
        caution = 0.05;
        danger = 0.05; // 드물지만 발생 시 중요
      } else if (dp === "REST") {
        caution = 0.06;
        check = 0.1; // 장시간 미움직임 체크
      } else if (isMeal(dp) || isProgram(dp)) {
        caution = 0.04;
        danger = 0.01;
      }
      if (highRisk) danger *= 2;
      if (r < danger && this.canSpawnDanger(now)) return "DANGER";
      if (r < danger + caution) return "CAUTION";
      if (r < danger + caution + check) return "CHECK_NEEDED";
      return "STABLE";
    }

    if (space.type === "HALLWAY") {
      const count = this.statuses[space.id].peopleCount;
      if (dp === "NIGHT") {
        if (count >= 1) {
          if (r < 0.25 && this.canSpawnDanger(now)) return "DANGER"; // 야간 단독 이동
          if (r < 0.7) return "CAUTION";
        }
        return "STABLE";
      }
      if (isMeal(dp) || isProgram(dp)) {
        if (count >= 4 && r < 0.3 * calm) return "CAUTION"; // 이동 인원 많음
        return "STABLE";
      }
      if (r < 0.08 * calm) return "CAUTION";
      return "STABLE";
    }

    // 그 외 공용/직원 공간: 거의 안정
    if (r < 0.03) return "CAUTION";
    return "STABLE";
  }

  private applyStatus(id: string, space: Space, next: SpaceStatusLevel, dp: DayPart, now: number, nowIso: string) {
    const st = this.statuses[id];
    let kakao: SpaceStatus["kakaoAlertStatus"] = "NONE";
    let hold = rnd(30_000, 180_000);
    let emergency = false;
    let msg = this.message(next, space, dp);

    if (next === "DANGER") {
      kakao = "SENT";
      // ★ 위험/응급은 자동 복귀 금지 — 직원 확인 전까지 유지
      hold = Number.MAX_SAFE_INTEGER;
      this.lastDangerAt = now;
      // 호실 위험 일부는 응급(바닥 자세/낙상)으로 격상 — 드물게
      emergency = space.type === "ROOM" && Math.random() < 0.3;
      if (emergency) msg = "바닥에 쓰러진 자세가 감지되었습니다. 즉시 확인해주세요.";
      this.createDangerEvent(space, msg, nowIso, emergency);
    } else if (next === "CAUTION") {
      kakao = Math.random() < 0.4 ? "PENDING" : "NONE";
      hold = rnd(20_000, 60_000);
    } else if (next === "CHECK_NEEDED") {
      kakao = "PENDING";
      hold = rnd(30_000, 60_000);
    }

    this.statuses[id] = {
      ...st,
      status: next,
      movementLevel: activityType(space.type) ? "HIGH" : movementByStatus[next],
      fallRiskLevel: fallByStatus[next],
      aiSummary: msg,
      kakaoAlertStatus: kakao,
      lastDetectedAt: nowIso,
      bedsideActivity: next === "CAUTION" || next === "DANGER" ? true : undefined,
      soloMovementAttempt: next === "DANGER" ? true : undefined,
      prolongedInactivity: next === "CHECK_NEEDED" ? true : undefined,
      emergency: emergency ? true : undefined,
    };
    this.rt[id].holdUntil = now + hold;
  }

  private createDangerEvent(space: Space, msg: string, nowIso: string, emergency: boolean) {
    // 호실이면 침대(구역) 단위로 표기 — 얼굴 인식 없이 "어느 침대인지"만.
    let zoneId: string | undefined;
    let zoneName: string | undefined;
    let locationName = space.name;
    if (space.type === "ROOM") {
      const beds = db.zones.filter((z) => z.spaceId === space.id && z.type === "BED");
      if (beds.length) {
        const assignedBedId = db.assignments.find(
          (a) => a.active && a.spaceId === space.id && a.zoneId
        )?.zoneId;
        const bed = beds.find((b) => b.id === assignedBedId) ?? beds[Math.floor(Math.random() * beds.length)];
        zoneId = bed.id;
        zoneName = bed.name;
        locationName = `${space.name} ${bed.name}`;
      }
    }
    const ev: DetectionEvent = {
      id: uid("ev"),
      facilityId: space.facilityId,
      spaceId: space.id,
      zoneId,
      zoneName,
      eventType: space.type === "HALLWAY" ? "WANDERING" : "FALL_RISK",
      riskLevel: "HIGH",
      message: emergency
        ? "바닥 자세 감지(응급)"
        : space.type === "HALLWAY"
        ? "복도 단독 이동 가능성"
        : "혼자 이동 시도 가능성",
      aiSummary: `${locationName} ${msg}`,
      detectedAt: nowIso,
      kakaoAlertStatus: "SENT",
      confidence: 0.8 + Math.random() * 0.15,
      actions: [],
      emergency,
    };
    db.events.unshift(ev);
    this.eventBySpace[space.id] = ev.id;
  }

  // ---------- 상황별 문구 ----------
  private message(level: SpaceStatusLevel, space: Space, dp: DayPart): string {
    const t = space.type;
    if (level === "DANGER") {
      if (t === "HALLWAY")
        return dp === "NIGHT"
          ? "야간 복도에서 단독 이동 가능성이 있습니다. 직원 확인 필요"
          : "복도에서 비틀거림 가능성이 있습니다. 직원 확인 필요";
      return dp === "NIGHT" || dp === "BEDTIME"
        ? "혼자 일어나려는 움직임이 감지되었습니다. 직원 확인 필요"
        : "혼자 일어나려는 움직임이 있습니다. 직원 확인 필요";
    }
    if (level === "CAUTION") {
      if (t === "HALLWAY")
        return isMeal(dp)
          ? "복도 이동 인원이 증가했습니다."
          : "느린 보행이 감지되었습니다.";
      if (dp === "BEDTIME") return "취침 준비 중 침대 주변 움직임이 있습니다.";
      if (dp === "EARLY_MORNING") return "기상 시간대로 침대 주변 움직임이 있습니다.";
      return "침대 주변 움직임이 많습니다.";
    }
    if (level === "CHECK_NEEDED") return "한동안 움직임이 없습니다. 확인이 필요합니다.";

    // STABLE
    switch (t) {
      case "PROGRAM_ROOM":
        return isProgram(dp) ? "프로그램 활동 중으로 움직임이 많습니다." : "현재 이용 인원이 적습니다.";
      case "REHAB_ROOM":
        return isProgram(dp) ? "직원 동행 하에 재활 활동 중입니다." : "현재 이용 인원이 적습니다.";
      case "DINING":
        return isMeal(dp) ? "식사 시간으로 인원이 많습니다." : "식사 시간 외 시간입니다.";
      case "HALLWAY":
        return isMeal(dp) ? "이동 인원이 증가했습니다." : "통행이 원활합니다.";
      case "ROOM":
        return dp === "REST" || dp === "NIGHT" ? "휴식 중입니다." : "현재 안정적인 상태입니다.";
      case "NURSE_STATION":
        return "간호 직원이 상주하고 있습니다.";
      default:
        return "안정적으로 유지되고 있습니다.";
    }
  }

  private emit() {
    const snap = this.getSnapshot();
    this.listeners.forEach((l) => l(snap));
  }
}

export const realtimeEngine = new RealtimeEngine();
