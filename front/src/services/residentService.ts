// 관심 어르신(Focus Resident) 서비스 (mock)
// 실제: GET /api/facilities/:id/focus-residents, GET /api/residents/:id, POST /api/residents/:id/action
import { db } from "./db";
import { delay, uid } from "@/lib/utils";
import type {
  DetectionEvent,
  FocusResidentView,
  Resident,
  ResidentAction,
  ResidentActionType,
  ResidentRiskSummary,
  VideoClip,
} from "@/types";

const TODAY = "2026-06-18";

const riskRank = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function latestAction(residentId: string): ResidentAction | undefined {
  return db.residentActions
    .filter((a) => a.residentId === residentId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
}

function summaryFor(residentId: string, date: string): ResidentRiskSummary | undefined {
  return db.residentSummaries.find((s) => s.residentId === residentId && s.date === date);
}

export const residentService = {
  /** 오늘 집중 관찰 대상 — 위험도 높은 순 */
  async listFocus(facilityId: string): Promise<FocusResidentView[]> {
    const list = db.residents
      .filter((r) => r.facilityId === facilityId && r.isFocusResident)
      .map((r) => buildView(r))
      .filter((v): v is FocusResidentView => !!v)
      .sort(
        (a, b) =>
          riskRank[b.today.riskLevel] - riskRank[a.today.riskLevel] ||
          b.today.fallRiskScore - a.today.fallRiskScore
      );
    return delay(list);
  },

  async getDetail(residentId: string): Promise<
    | (FocusResidentView & { recentEvents: DetectionEvent[]; clip?: VideoClip; deltaScore: number })
    | null
  > {
    const r = db.residents.find((x) => x.id === residentId);
    if (!r) return delay(null);
    const view = buildView(r);
    if (!view) return delay(null);
    const recentEvents = db.events
      .filter((e) => e.spaceId === r.roomId)
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))
      .slice(0, 6);
    const clip = db.videoClips.find((c) => c.spaceId === r.roomId);
    const deltaScore = view.today.fallRiskScore - (view.yesterday?.fallRiskScore ?? view.today.fallRiskScore);
    return delay({ ...view, recentEvents, clip, deltaScore });
  },

  async addAction(
    residentId: string,
    type: ResidentActionType,
    by: string
  ): Promise<ResidentAction> {
    const action: ResidentAction = {
      id: uid("ract"),
      residentId,
      type,
      createdBy: by,
      createdAt: new Date().toISOString(),
    };
    db.residentActions.unshift(action);
    return delay(action);
  },

  async listActions(residentId: string): Promise<ResidentAction[]> {
    return delay(
      db.residentActions
        .filter((a) => a.residentId === residentId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    );
  },

  async listResidents(facilityId: string): Promise<Resident[]> {
    return delay(db.residents.filter((r) => r.facilityId === facilityId));
  },
};

function buildView(r: Resident): FocusResidentView | null {
  const today = summaryFor(r.id, TODAY);
  if (!today) return null;
  const asg = db.assignments.find((a) => a.active && a.residentId === r.id);
  const bedName = asg?.zoneId ? db.zones.find((z) => z.id === asg.zoneId)?.name : undefined;
  return {
    resident: r,
    room: db.spaces.find((s) => s.id === r.roomId),
    bedName,
    today,
    yesterday: db.residentSummaries.find((s) => s.residentId === r.id && s.date !== TODAY),
    lastAction: latestAction(r.id),
  };
}
