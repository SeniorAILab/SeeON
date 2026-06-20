// Dashboard / Space 상태 조회 서비스 (mock)
// 실제: GET /api/facilities/:id/dashboard, /api/spaces/:id/status, /api/spaces/:id/events
import { db } from "./db";
import { delay } from "@/lib/utils";
import type {
  DashboardResponse,
  DashboardSummary,
  DetectionEvent,
  SpaceStatus,
} from "@/types";

function buildSummary(statuses: SpaceStatus[], unack: number): DashboardSummary {
  return {
    totalSpaces: statuses.length,
    stable: statuses.filter((s) => s.status === "STABLE").length,
    caution: statuses.filter((s) => s.status === "CAUTION").length,
    danger: statuses.filter((s) => s.status === "DANGER").length,
    checkNeeded: statuses.filter((s) => s.status === "CHECK_NEEDED").length,
    unacknowledged: unack,
  };
}

export const dashboardService = {
  async getDashboard(facilityId: string): Promise<DashboardResponse> {
    const facility = db.facilities.find((f) => f.id === facilityId);
    if (!facility) throw new Error("시설을 찾을 수 없습니다.");

    const floors = db.floors
      .filter((f) => f.facilityId === facilityId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const spaces = db.spaces.filter((s) => s.facilityId === facilityId);
    const spaceIds = new Set(spaces.map((s) => s.id));

    const statuses: Record<string, SpaceStatus> = {};
    for (const st of db.statuses) {
      if (spaceIds.has(st.spaceId)) statuses[st.spaceId] = st;
    }

    const unacknowledgedEvents = db.events
      .filter(
        (e) =>
          e.facilityId === facilityId &&
          e.kakaoAlertStatus !== "ACKNOWLEDGED" &&
          e.riskLevel !== "LOW"
      )
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt));

    const summary = buildSummary(
      Object.values(statuses),
      unacknowledgedEvents.length
    );

    return delay({
      facility,
      floors,
      spaces,
      statuses,
      summary,
      unacknowledgedEvents,
    });
  },

  async getSpaceStatus(spaceId: string): Promise<SpaceStatus | undefined> {
    return delay(db.statuses.find((s) => s.spaceId === spaceId));
  },

  async getSpaceEvents(spaceId: string): Promise<DetectionEvent[]> {
    const list = db.events
      .filter((e) => e.spaceId === spaceId)
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt));
    return delay(list);
  },
};
