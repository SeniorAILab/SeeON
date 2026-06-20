// =============================================================
// 카카오톡 알림 서비스 (mock)
// ★ 실제 연동 지점 ★
//   - 현재는 콘솔 로그 + 상태 전이만 수행
//   - 실제: POST /api/alerts/kakao/send → 카카오 알림톡(비즈메시지) API 호출
//   - 메시지 템플릿/수신자/발송 결과만 이 레이어에서 관리하면 됨
// =============================================================
import { delay } from "@/lib/utils";
import type { DetectionEvent, Facility, Space } from "@/types";

export interface KakaoMessage {
  to: string[];
  text: string;
}

export interface KakaoSendResult {
  ok: boolean;
  messageId: string;
  sentAt: string;
}

/**
 * 카카오 알림톡 본문 — 현장 직원이 바로 이해할 수 있는 한글 문구.
 * 위험도 점수/영어 용어 없이 "무슨 일이고 몇 명 있는지"만 전달한다.
 * 예) [Senior AI Lab] 202호 확인이 필요합니다.
 *     침대 주변 움직임이 많습니다. 현재 2명 있습니다. 직원 확인을 권장합니다.
 */
export function buildKakaoMessage(
  facility: Facility,
  space: Space,
  event: { aiSummary?: string; message: string; peopleCount?: number }
): string {
  const what = event.aiSummary?.trim() || event.message;
  const who =
    event.peopleCount != null
      ? `현재 ${event.peopleCount <= 0 ? "아무도 없습니다" : `${event.peopleCount}명 있습니다`}.`
      : "";
  return [
    `[Senior AI Lab] ${space.name} 확인이 필요합니다.`,
    `(${facility.name})`,
    ``,
    [what, who, "직원 확인을 권장합니다."].filter(Boolean).join(" "),
  ].join("\n");
}

export const kakaoService = {
  /** 실제 API 연동 시 이 함수 내부만 fetch 로 교체 */
  async send(message: KakaoMessage): Promise<KakaoSendResult> {
    // eslint-disable-next-line no-console
    console.info("[Kakao mock] 발송", message);
    return delay({
      ok: true,
      messageId: `kakao_${Date.now()}`,
      sentAt: new Date().toISOString(),
    });
  },

  /** 이벤트 기반 발송 헬퍼 */
  async sendForEvent(
    facility: Facility,
    space: Space,
    event: DetectionEvent,
    recipients: string[],
    peopleCount?: number
  ): Promise<KakaoSendResult> {
    const text = buildKakaoMessage(facility, space, { ...event, peopleCount });
    return this.send({ to: recipients, text });
  },
};
