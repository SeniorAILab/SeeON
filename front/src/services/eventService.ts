import { acknowledgeAlert, listAlerts } from "@/services/api/alertEndpoints";
import { USE_MOCK } from "@/services/apiClient";
import { db } from "./db";
import { delay, uid } from "@/lib/utils";
import type { ActionLog, ActionType, DetectionEvent } from "@/types";

let alertCache: DetectionEvent[] = [];
function actionAcknowledges(type: ActionType): boolean {
  return type === "ACKNOWLEDGED" || type === "NO_ISSUE" || type === "STAFF_VISIT";
}


export const eventService = {
  async getById(eventId: string): Promise<DetectionEvent | undefined> {
    if (!USE_MOCK) return (await listAlerts()).find((e) => e.id === eventId);
    return delay(db.events.find((e) => e.id === eventId));
  },

  /** 공간의 현재 미확인 이벤트(최신) — 침대/사유 표시용 */
  openForSpace(spaceId: string): DetectionEvent | undefined {
    const events = USE_MOCK ? db.events : alertCache;
    return events
      .filter((e) => e.spaceId === spaceId && e.kakaoAlertStatus !== "ACKNOWLEDGED" && e.riskLevel !== "LOW")
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))[0];
  },

  async listByFacility(facilityId: string): Promise<DetectionEvent[]> {
    const events = USE_MOCK ? db.events : await listAlerts();
    if (!USE_MOCK) alertCache = events;
    const list = events
      .filter((e) => e.facilityId === facilityId)
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt));
    return USE_MOCK ? delay(list) : list;
  },
  async acknowledge(eventId: string, userName: string): Promise<DetectionEvent> {
    if (!USE_MOCK) {
      const ev = await acknowledgeAlert(eventId);
      alertCache = alertCache.map((item) => (item.id === ev.id ? ev : item));
      return { ...ev, acknowledgedBy: userName, acknowledgedAt: ev.acknowledgedAt ?? new Date().toISOString() };
    }
    const ev = db.events.find((e) => e.id === eventId);
    if (!ev) throw new Error("이벤트를 찾을 수 없습니다.");
    ev.acknowledgedBy = userName;
    ev.acknowledgedAt = new Date().toISOString();
    ev.kakaoAlertStatus = "ACKNOWLEDGED";
    const status = db.statuses.find((s) => s.spaceId === ev.spaceId);
    if (status && status.kakaoAlertStatus !== "NONE") {
      status.kakaoAlertStatus = "ACKNOWLEDGED";
    }
    return delay(ev);
  },

  async addAction(
    eventId: string,
    type: ActionType,
    note: string | undefined,
    userName: string
  ): Promise<DetectionEvent> {
    if (!USE_MOCK) {
      if (actionAcknowledges(type)) return this.acknowledge(eventId, userName);
      const ev = await this.getById(eventId);
      if (!ev) throw new Error("이벤트를 찾을 수 없습니다.");
      return ev;
    }
    const ev = db.events.find((e) => e.id === eventId);
    if (!ev) throw new Error("이벤트를 찾을 수 없습니다.");
    const action: ActionLog = {
      id: uid("act"),
      type,
      note,
      createdBy: userName,
      createdAt: new Date().toISOString(),
    };
    ev.actions = [action, ...ev.actions];
    // 확인성 조치는 자동 acknowledge 처리
    if (actionAcknowledges(type)) {
      if (!ev.acknowledgedBy) {
        ev.acknowledgedBy = userName;
        ev.acknowledgedAt = action.createdAt;
        ev.kakaoAlertStatus = "ACKNOWLEDGED";
      }
    }
    return delay(ev);
  },
};
