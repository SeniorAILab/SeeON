// 이벤트 확인/조치 서비스 (mock)
// 실제: POST /api/events/:id/acknowledge, POST /api/events/:id/action-note
import { db } from "./db";
import { delay, uid } from "@/lib/utils";
import type { ActionLog, ActionType, DetectionEvent } from "@/types";

export const eventService = {
  async getById(eventId: string): Promise<DetectionEvent | undefined> {
    return delay(db.events.find((e) => e.id === eventId));
  },

  /** 공간의 현재 미확인 이벤트(최신) — 침대/사유 표시용 */
  openForSpace(spaceId: string): DetectionEvent | undefined {
    return db.events
      .filter((e) => e.spaceId === spaceId && e.kakaoAlertStatus !== "ACKNOWLEDGED" && e.riskLevel !== "LOW")
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))[0];
  },

  async listByFacility(facilityId: string): Promise<DetectionEvent[]> {
    return delay(
      db.events
        .filter((e) => e.facilityId === facilityId)
        .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))
    );
  },

  async acknowledge(eventId: string, userName: string): Promise<DetectionEvent> {
    const ev = db.events.find((e) => e.id === eventId);
    if (!ev) throw new Error("이벤트를 찾을 수 없습니다.");
    ev.acknowledgedBy = userName;
    ev.acknowledgedAt = new Date().toISOString();
    ev.kakaoAlertStatus = "ACKNOWLEDGED";
    // 연결된 공간 상태도 확인 처리 반영
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
    if (type === "ACKNOWLEDGED" || type === "NO_ISSUE" || type === "STAFF_VISIT") {
      if (!ev.acknowledgedBy) {
        ev.acknowledgedBy = userName;
        ev.acknowledgedAt = action.createdAt;
        ev.kakaoAlertStatus = "ACKNOWLEDGED";
      }
    }
    return delay(ev);
  },
};
