// =============================================================
// AI 모델 → 백엔드 수신 파이프라인 (mock)
// ★ 실제 연동 지점 ★
//   엔드포인트: POST /api/ai/detection-result
//   AI 예측 모델이 아래 payload 를 전송하면 다음을 수행:
//     1) SpaceStatus 업데이트
//     2) DetectionEvent 생성
//     3) 알림 규칙 확인
//     4) 필요 시 카카오톡 알림 발송
//     5) 대시보드 실시간 반영(현재는 store 갱신/폴링)
//   프론트 데모에서는 이 함수로 실시간 유입을 시뮬레이션할 수 있다.
// =============================================================
import { db } from "./db";
import { kakaoService } from "./kakaoService";
import { uid } from "@/lib/utils";
import { eventTypeLabel } from "@/lib/labels";
import type {
  AIDetectionPayload,
  DetectionEvent,
  KakaoAlertStatus,
  Level,
  SpaceStatusLevel,
} from "@/types";

const levelRank: Record<Level, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function deriveStatus(fall: Level, movement: Level): SpaceStatusLevel {
  if (fall === "HIGH") return "DANGER";
  if (fall === "MEDIUM") return "CAUTION";
  if (movement === "HIGH") return "CAUTION";
  return "STABLE";
}

export const aiIngestService = {
  /** AI 감지 결과 1건을 수신 처리 */
  async ingest(payload: AIDetectionPayload): Promise<DetectionEvent> {
    const facility = db.facilities.find((f) => f.code === payload.facilityCode);
    const space = db.spaces.find((s) => s.id === payload.spaceId);
    if (!facility || !space) throw new Error("시설/공간 매칭 실패");

    const status = db.statuses.find((s) => s.spaceId === payload.spaceId);
    const derivedStatus = deriveStatus(payload.fallRiskLevel, payload.movementLevel);

    // 1) 알림 규칙 확인
    const rule =
      db.alertRules.find(
        (r) => r.facilityId === facility.id && r.spaceId === space.id
      ) ?? db.alertRules.find((r) => r.facilityId === facility.id && r.spaceId === null);

    const shouldAlert =
      !!rule &&
      rule.kakaoEnabled &&
      levelRank[payload.fallRiskLevel] >= levelRank[rule.minRiskLevel];

    let kakaoStatus: KakaoAlertStatus = "NONE";
    if (shouldAlert) {
      kakaoStatus = "SENDING";
    }

    // 2) SpaceStatus 업데이트
    if (status) {
      status.peopleCount = payload.peopleCount;
      status.movementLevel = payload.movementLevel;
      status.fallRiskLevel = payload.fallRiskLevel;
      status.status = derivedStatus;
      status.aiSummary = payload.aiSummary;
      status.lastDetectedAt = payload.timestamp;
      status.kakaoAlertStatus = kakaoStatus;
    }

    // 3) DetectionEvent 생성
    const event: DetectionEvent = {
      id: uid("ev"),
      facilityId: facility.id,
      spaceId: space.id,
      eventType: payload.eventType,
      riskLevel: payload.fallRiskLevel,
      message: eventTypeLabel[payload.eventType] ?? "감지",
      aiSummary: payload.aiSummary,
      detectedAt: payload.timestamp,
      kakaoAlertStatus: kakaoStatus,
      confidence: payload.confidence,
      actions: [],
    };
    db.events.unshift(event);

    // 4) 카카오톡 발송
    if (shouldAlert && rule) {
      const res = await kakaoService.sendForEvent(
        facility,
        space,
        event,
        rule.recipients,
        payload.peopleCount
      );
      const next: KakaoAlertStatus = res.ok ? "SENT" : "FAILED";
      event.kakaoAlertStatus = next;
      if (status) status.kakaoAlertStatus = next;
    }

    return event;
  },
};
