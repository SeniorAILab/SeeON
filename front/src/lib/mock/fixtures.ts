// Deterministic demo data for the facility '행복한요양원 녹양역'.
// All values are seeded from a fixed base time so SSR and the first client
// render agree (no hydration drift). No 'demo/sample/mock' wording appears in
// any field that renders to the UI.
import type {
  DemoCamera,
  DemoGuardian,
  DemoResident,
  OrgInfo,
  ResidentStatus,
  SseAlert,
} from "./types";

export const ORG: OrgInfo = {
  id: "org-happy-nogyang-01",
  name: "행복한요양원 녹양역",
  locale: "경기도 의정부시 녹양로",
};

// Fixed base clock: scenario is seeded relative to this instant so the 7-day
// history and initial statuses are reproducible across SSR/client/refresh.
export const BASE_TIME = "2026-06-18T09:00:00+09:00";

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
// 16 residents across 2 floors. Korean pseudonyms, deterministic.
export const RESIDENTS: DemoResident[] = Array.from({ length: 16 }, (_, i) => {
  const floor = i < 8 ? 2 : 3;
  const roomNo = floor * 100 + (i % 8) + 1;
  const careLevels = ["1등급", "2등급", "3등급", "4등급"];
  return {
    id: `res-${String(i + 1).padStart(2, "0")}`,
    name: `${SURNAMES[i % SURNAMES.length]}${["복순", "영자", "정애", "말순", "옥분", "춘자", "귀남", "병호", "달수", "종근", "판석", "두식", "용득", "기철", "순임", "금례"][i]}`,
    room: `${roomNo}`,
    birthYear: 1934 + (i % 12),
    careLevel: careLevels[i % careLevels.length],
    admittedAt: `${2023 + (i % 3)}-0${(i % 9) + 1}-1${i % 9}T00:00:00+09:00`,
  };
});

export const GUARDIANS: DemoGuardian[] = RESIDENTS.map((r, i) => ({
  id: `grd-${String(i + 1).padStart(2, "0")}`,
  residentId: r.id,
  name: `${SURNAMES[(i + 3) % SURNAMES.length]}${["민준", "서연", "지후", "하은", "도윤", "수아", "예준", "지우", "현우", "유나", "건우", "서윤", "우진", "지아", "정우", "다은"][i]}`,
  phone: `0101${String(2340000 + i * 1357).slice(0, 7)}`,
  relation: ["자녀", "배우자", "자녀", "형제", "자녀", "며느리", "자녀", "손주"][i % 8],
}));

// ~10 cameras; a couple offline to look operationally real.
export const CAMERAS: DemoCamera[] = Array.from({ length: 10 }, (_, i) => {
  const res = RESIDENTS[i];
  const online = i !== 3 && i !== 7; // 2 offline
  return {
    id: `cam-${String(i + 1).padStart(2, "0")}`,
    label: `${res?.room ? `${res.room}호` : `복도-${i}`} 천장형`,
    residentId: res?.id ?? null,
    online,
    lastSeenAt: online
      ? minutesBefore(BASE_TIME, (i % 5) + 1)
      : minutesBefore(BASE_TIME, 60 * (i + 2)),
    ingestKeyId: `ingest-${String(i + 1).padStart(2, "0")}`,
  };
});

function minutesBefore(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() - mins * 60_000).toISOString();
}

function hoursBefore(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() - hours * 3_600_000).toISOString();
}

const ALERT_TYPES = ["FALL", "BED_EXIT", "NO_MOTION"] as const;

/** Deterministic 7-day alert history (most-recent first via merge/sort downstream). */
export function buildAlertHistory(baseTime = BASE_TIME): SseAlert[] {
  const alerts: SseAlert[] = [];
  let seq = 1000;
  // 22 historical alerts spread over 7 days.
  for (let i = 0; i < 22; i++) {
    const res = RESIDENTS[(i * 3) % RESIDENTS.length];
    const cam = CAMERAS.find((c) => c.residentId === res.id) ?? null;
    const type = ALERT_TYPES[i % ALERT_TYPES.length];
    const hoursAgo = Math.floor((i + 1) * 7.4); // spread across ~7 days
    const probability =
      type === "FALL" ? 0.82 + (i % 5) * 0.03 : 0.45 + (i % 4) * 0.08;
    // Older alerts resolved/acked; the most recent few are NEW.
    const status = i < 2 ? "NEW" : i < 6 ? "ACKED" : "RESOLVED";
    alerts.push({
      alertSeq: String(seq++),
      id: `alh-${String(i + 1).padStart(3, "0")}`,
      orgId: ORG.id,
      residentId: res.id,
      cameraId: cam?.id ?? null,
      type,
      probability: Math.round(probability * 100) / 100,
      detectedAt: hoursBefore(baseTime, hoursAgo),
      status,
      resident: { name: res.name, room: res.room },
    });
  }
  return alerts;
}

/** Deterministic initial per-resident status read model. */
export function buildStatuses(baseTime = BASE_TIME): ResidentStatus[] {
  return RESIDENTS.map((r, i) => {
    const cam = CAMERAS.find((c) => c.residentId === r.id);
    const state =
      i === 5 ? "WARNING" : i === 11 ? "WARNING" : "NORMAL";
    return {
      id: `st-${r.id}`,
      residentId: r.id,
      orgId: ORG.id,
      state,
      lastSeenAt: minutesBefore(baseTime, (i % 6) + 1),
      cameraOnline: cam?.online ?? false,
      source: cam?.id ?? null,
      updatedAt: minutesBefore(baseTime, i % 6),
      resident: { name: r.name, room: r.room },
    };
  });
}

export { minutesBefore, hoursBefore };
