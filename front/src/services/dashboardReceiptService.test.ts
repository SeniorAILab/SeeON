import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/services/apiClient";
import type { DetectionEvent } from "@/types";
import {
  getDashboardClientId,
  recordDashboardDelivery,
  recordDashboardPresentation,
} from "./dashboardReceiptService";

vi.mock("@/services/apiClient", () => ({ requestJson: vi.fn() }));

const requestJsonMock = vi.mocked(requestJson);

function alert(id: string, backendEventId: string | null = `event-${id}`): DetectionEvent {
  return {
    id,
    backendEventId,
    alertSeq: "42",
    facilityId: "facility-1",
    spaceId: "space-1",
    eventType: "BED_EXIT",
    riskLevel: "HIGH",
    message: "침상 이탈 감지",
    aiSummary: "침상 이탈이 감지되었습니다.",
    detectedAt: "2026-07-17T03:00:00.000Z",
    alertStatus: "PENDING",
    actions: [],
  };
}

describe("dashboardReceiptService", () => {
  beforeEach(() => {
    window.localStorage.clear();
    requestJsonMock.mockReset();
  });

  it("returns and locally reuses the backend delivery id", async () => {
    requestJsonMock.mockResolvedValue({
      deliveryId: "delivery-1",
      backendEventId: "event-alert-1",
      alertId: "alert-1",
      alertSeq: "42",
      kind: "delivery",
      surface: "normalized-feed",
      observedAt: "2026-07-17T03:00:00.000Z",
      recordedAt: "2026-07-17T03:00:01.000Z",
      duplicate: false,
    });

    const first = await recordDashboardDelivery(alert("alert-1"));
    const second = await recordDashboardDelivery(alert("alert-1"));

    expect(first?.deliveryId).toBe("delivery-1");
    expect(second?.deliveryId).toBe("delivery-1");
    expect(requestJsonMock).toHaveBeenCalledTimes(1);
    expect(requestJsonMock).toHaveBeenCalledWith(
      "/dashboard/receipts/delivery",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"backendEventId":"event-alert-1"'),
      }),
    );
  });

  it("returns the presentation id for the exact DOM surface", async () => {
    requestJsonMock.mockResolvedValue({
      presentationId: "presentation-1",
      backendEventId: "event-alert-2",
      alertId: "alert-2",
      alertSeq: "42",
      kind: "presentation",
      surface: "monitor-room-board:focus",
      observedAt: "2026-07-17T03:00:00.000Z",
      recordedAt: "2026-07-17T03:00:01.000Z",
      duplicate: false,
    });

    const result = await recordDashboardPresentation(
      alert("alert-2"),
      "monitor-room-board:focus",
    );

    expect(result?.presentationId).toBe("presentation-1");
    expect(requestJsonMock).toHaveBeenCalledWith(
      "/dashboard/receipts/presentation",
      expect.objectContaining({
        body: expect.stringContaining(
          '"surface":"monitor-room-board:focus"',
        ),
      }),
    );
  });

  it("does not fabricate a receipt without a backend event id", async () => {
    await expect(recordDashboardDelivery(alert("alert-3", null))).resolves.toBeNull();
    expect(requestJsonMock).not.toHaveBeenCalled();
  });

  it("keeps one dashboard client id across calls", () => {
    expect(getDashboardClientId()).toBe(getDashboardClientId());
  });
});
