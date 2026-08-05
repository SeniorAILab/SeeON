import { listAlertNotes, createAlertNote } from "@/services/api/alertNotes";
import { acknowledgeAlert, getAlertById, listAllAlerts } from "@/services/api/alertEndpoints";
import type { ActionType, DetectionEvent } from "@/types";

let alertCache: DetectionEvent[] = [];
function actionAcknowledges(type: ActionType): boolean {
  return type === "ACKNOWLEDGED";
}


export const eventService = {
  async getById(eventId: string): Promise<DetectionEvent | undefined> {
    // 목록 캐시에서 찾지 않고 단건 라우트로 직접 간다. 목록을 거치면
    // 상세 열람이 "목록을 어디까지 받아왔는가"에 매인다. 링크로 바로
    // 들어오는 경우처럼 목록을 아직 안 받은 상태에서도 열려야 한다.
    try {
      const event = await getAlertById(eventId);
      return { ...event, actions: await listAlertNotes(event.id) };
    } catch {
      return undefined;
    }
  },

  /** 공간의 현재 미확인 이벤트(최신) — 침대/사유 표시용 */
  openForSpace(spaceId: string): DetectionEvent | undefined {
    const events = alertCache;
    return events
      .filter((e) => e.spaceId === spaceId && e.alertStatus !== "ACKNOWLEDGED" && e.riskLevel !== "LOW")
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))[0];
  },

  async listByFacility(facilityId: string): Promise<DetectionEvent[]> {
    // 목록 화면은 과거 사건을 찾는 곳이므로 전부 모은다. 서버 기본값(50건)만
    // 받으면 그보다 오래된 사건이 화면에서 사라진 것처럼 보인다.
    const events = (await listAllAlerts()).map((event) => ({ ...event, actions: [] }));
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
    const action = await createAlertNote(eventId, note ?? "");
    const current = (await this.getById(eventId)) ?? alertCache.find((event) => event.id === eventId);
    if (!current) throw new Error("이벤트를 찾을 수 없습니다.");
    const updated = { ...current, actions: [action, ...current.actions] };
    alertCache = alertCache.map((item) => (item.id === eventId ? updated : item));
    return updated;
  },
};
