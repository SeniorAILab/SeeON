import { acknowledgeAlert, listAlerts } from "@/services/api/alertEndpoints";
import type { ActionType, DetectionEvent } from "@/types";

let alertCache: DetectionEvent[] = [];
function actionAcknowledges(type: ActionType): boolean {
  return type === "ACKNOWLEDGED";
}


export const eventService = {
  async getById(eventId: string): Promise<DetectionEvent | undefined> {
    return (await listAlerts()).find((e) => e.id === eventId);
  },

  /** 공간의 현재 미확인 이벤트(최신) — 침대/사유 표시용 */
  openForSpace(spaceId: string): DetectionEvent | undefined {
    const events = alertCache;
    return events
      .filter((e) => e.spaceId === spaceId && e.kakaoAlertStatus !== "ACKNOWLEDGED" && e.riskLevel !== "LOW")
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))[0];
  },

  async listByFacility(facilityId: string): Promise<DetectionEvent[]> {
    const events = await listAlerts();
    alertCache = events;
    return events
      .filter((e) => e.facilityId === facilityId)
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt));
  },
  async acknowledge(eventId: string, userName: string): Promise<DetectionEvent> {
    const ev = await acknowledgeAlert(eventId);
    alertCache = alertCache.map((item) => (item.id === ev.id ? ev : item));
    return { ...ev, acknowledgedBy: userName, acknowledgedAt: ev.acknowledgedAt ?? new Date().toISOString() };
  },

  async addAction(
    eventId: string,
    type: ActionType,
    note: string | undefined,
    userName: string
  ): Promise<DetectionEvent> {
    if (actionAcknowledges(type)) return this.acknowledge(eventId, userName);
    throw new Error(
      note
        ? "메모 저장 API가 없어 확인 완료 외 조치는 저장할 수 없습니다."
        : "확인 완료 외 조치는 저장할 수 없습니다."
    );
  },
};
