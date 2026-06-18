// Demo-mode domain types. Reuses the canonical SSE/domain types from
// ../sse-utils so the mock layer renders through the exact same components
// and merge logic as the live backend path.
import type {
  SseAlert,
  ResidentStatus,
  SseStatusEvent,
  AlertStatus,
  ResidentState,
} from "../sse-utils";

export type { SseAlert, ResidentStatus, SseStatusEvent, AlertStatus, ResidentState };

/** Frontend-only role identity for the demo. CAREGIVER is a display label only —
 * the backend Prisma Role enum (OWNER/ADMIN) is never changed. */
export type DemoRole = "CAREGIVER" | "OWNER" | "ADMIN";

export interface DemoResident {
  id: string;
  name: string;
  room: string;
  birthYear: number;
  careLevel: string; // 장기요양등급
  admittedAt: string; // ISO
}

export interface DemoGuardian {
  id: string;
  residentId: string;
  name: string;
  phone: string; // full digits; UI masks per role
  relation: string;
}

export interface DemoCamera {
  id: string;
  label: string;
  residentId: string | null;
  online: boolean;
  lastSeenAt: string | null;
  ingestKeyId: string;
}

export interface DemoSessionUser {
  id: string;
  orgId: string;
  role: DemoRole;
  nickname: string;
}

export interface DemoSession {
  user: DemoSessionUser;
}

/** Full, serializable scenario state persisted to the browser store. */
export interface ScenarioState {
  /** ISO timestamp the scenario was seeded from (deterministic base clock). */
  baseTime: string;
  /** Next alertSeq to assign for generated live events. */
  nextSeq: number;
  residents: DemoResident[];
  guardians: DemoGuardian[];
  cameras: DemoCamera[];
  alerts: SseAlert[];
  statuses: ResidentStatus[];
}

export interface OrgInfo {
  id: string;
  name: string;
  locale: string;
}
