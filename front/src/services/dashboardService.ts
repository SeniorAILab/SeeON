// Dashboard / Space 상태 조회 서비스: real backend only.
import { getDashboardFromBackend } from "@/services/api/dashboardEndpoints";
import type {
  DashboardResponse,
  DetectionEvent,
  SpaceStatus,
} from "@/types";


export const dashboardService = {
  async getDashboard(_facilityId: string): Promise<DashboardResponse> {
    return getDashboardFromBackend();
  },

  async getSpaceStatus(spaceId: string): Promise<SpaceStatus | undefined> {
    return (await getDashboardFromBackend()).statuses[spaceId];
  },

  async getSpaceEvents(spaceId: string): Promise<DetectionEvent[]> {
    return (await getDashboardFromBackend()).unacknowledgedEvents
      .filter((e) => e.spaceId === spaceId)
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt));
  },
};
