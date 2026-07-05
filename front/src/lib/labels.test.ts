import { describe, expect, it } from "vitest";
import { displayEventTypeLabel, eventTypeLabel } from "./labels";
import type { DetectionEventType } from "@/types";

const knownEventTypes: Record<DetectionEventType, string> = {
  STABLE: "안정 상태",
  MOVEMENT_INCREASE: "움직임 증가",
  REPEATED_STANDING_ATTEMPT: "반복 기립 시도",
  FALL_RISK: "낙상 위험",
  SOLO_MOVEMENT: "혼자 이동 시도",
  PROLONGED_INACTIVITY: "장시간 미움직임",
  WANDERING: "배회 감지",
  BED_EXIT: "침대 이탈",
  OTHER: "기타 감지",
};

describe("eventTypeLabel", () => {
  it("labels every known detection event type", () => {
    for (const [type, label] of Object.entries(knownEventTypes)) {
      expect(eventTypeLabel[type]).toBe(label);
    }
  });

  it("safely falls back to the original value for unknown detection event types", () => {
    expect(eventTypeLabel.UNKNOWN_BACKEND_TYPE).toBe("알 수 없는 이벤트(UNKNOWN_BACKEND_TYPE)");
  });

  it("uses the original string even when the unknown type matches an object prototype key", () => {
    expect(eventTypeLabel.constructor).toBe("알 수 없는 이벤트(constructor)");
  });

  it("uses backendType for OTHER events when the backend sent an unknown type", () => {
    expect(displayEventTypeLabel({ eventType: "OTHER", backendType: "door-open-too-long" })).toBe(
      "알 수 없는 이벤트(door-open-too-long)"
    );
  });

  it("keeps the known OTHER label when no backend type is available", () => {
    expect(displayEventTypeLabel({ eventType: "OTHER" })).toBe("기타 감지");
  });
});
