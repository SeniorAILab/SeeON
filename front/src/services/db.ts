// ⚠ 비활 fixture: 런타임 도달 불가(가역 숨김 페이지 전용).
// 재활성 시 실백엔드로 배선하거나 페이지 영구 제거 시 함께 삭제.
// =============================================================
// 인메모리 fixture DB
// =============================================================
import {
  alertRules as seedAlertRules,
  detectionEvents as seedEvents,
  facilities as seedFacilities,
  floors as seedFloors,
  spaces as seedSpaces,
  spaceStatuses as seedStatuses,
  users as seedUsers,
  videoClips as seedVideoClips,
  residents as seedResidents,
  residentRiskSummaries as seedResidentSummaries,
  zones as seedZones,
  residentAssignments as seedAssignments,
} from "@/data/mockData";
import type {
  AlertRule,
  DetectionEvent,
  Facility,
  Floor,
  Resident,
  ResidentAction,
  ResidentAssignment,
  ResidentRiskSummary,
  Space,
  SpaceStatus,
  User,
  VideoAccessLog,
  VideoClip,
  Zone,
} from "@/types";

// 깊은 복제로 seed 보존(HMR/리셋 대비)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const db = {
  facilities: clone(seedFacilities) as Facility[],
  users: clone(seedUsers) as (User & { password: string })[],
  floors: clone(seedFloors) as Floor[],
  spaces: clone(seedSpaces) as Space[],
  statuses: clone(seedStatuses) as SpaceStatus[],
  events: clone(seedEvents) as DetectionEvent[],
  alertRules: clone(seedAlertRules) as AlertRule[],
  videoClips: clone(seedVideoClips) as VideoClip[],
  videoAccessLogs: [] as VideoAccessLog[],
  residents: clone(seedResidents) as Resident[],
  residentSummaries: clone(seedResidentSummaries) as ResidentRiskSummary[],
  residentActions: [] as ResidentAction[],
  zones: clone(seedZones) as Zone[],
  assignments: clone(seedAssignments) as ResidentAssignment[],
};

export type MockDb = typeof db;
