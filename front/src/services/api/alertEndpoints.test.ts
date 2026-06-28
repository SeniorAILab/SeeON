import { describe, expect, it } from "vitest";
import { mapAlertDto } from "./alertEndpoints";

describe("alertEndpoints", () => {
  it("maps backend bed-exit alerts to frontend domain alerts", () => {
    const mapped = mapAlertDto({
      alertSeq: "10",
      id: "a1",
      facilityId: "fac_happy_nokyang",
      residentId: "r1",
      cameraId: "cam_sp_201",
      spaceId: "sp_201",
      room: "201호",
      type: "bed-exit",
      probability: 0.91,
      snapshotKey: null,
      detectedAt: "2026-06-22T00:00:00.000Z",
      status: "NEW",
    });

    expect(mapped).toMatchObject({
      id: "a1",
      alertSeq: "10",
      eventType: "BED_EXIT",
      riskLevel: "HIGH",
      confidence: 0.91,
      kakaoAlertStatus: "PENDING",
      room: "201호",
    });
  });

  it("test_room_level_alert_does_not_require_resident", () => {
    const mapped = mapAlertDto({
      alertSeq: "11",
      id: "a-room",
      facilityId: "fac_happy_nokyang",
      residentId: null,
      cameraId: "cam_sp_201",
      spaceId: "sp_201",
      space: { name: "201호" },
      type: "bed-exit",
      probability: 0.92,
      detectedAt: "2026-06-22T00:00:01.000Z",
      status: "NEW",
    });

    expect(mapped.residentId).toBeNull();
    expect(mapped.spaceId).toBe("sp_201");
    expect(mapped.room).toBe("201호");
    expect(mapped.cameraId).toBe("cam_sp_201");
    expect(mapped.message).toContain("201호");
  });
});
