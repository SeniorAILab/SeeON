import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAlertsEndpoint,
  mapAlert,
  mapAlertDto,
  resolveAlertEndpoint,
  type AlertDto,
} from "./alertEndpoints";
import { requestJson } from "@/services/apiClient";

vi.mock("@/services/apiClient", () => ({
  requestJson: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);

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
      backendStatus: "NEW",
      backendType: "bed-exit",
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

  it("keeps low-probability fall display risk high enough not to gate activeness", () => {
    const mapped = mapAlertDto({
      alertSeq: "12",
      id: "a-low-fall",
      facilityId: "fac_happy_nokyang",
      residentId: null,
      cameraId: "cam_sp_201",
      spaceId: "sp_201",
      room: "201호",
      type: "fall",
      probability: 0.2,
      detectedAt: "2026-06-22T00:00:02.000Z",
      status: "NEW",
    });

    expect(mapped.backendStatus).toBe("NEW");
    expect(mapped.backendType).toBe("fall");
    expect(mapped.riskLevel).toBe("HIGH");
    expect(mapped.confidence).toBe(0.2);
  });

  it("maps RESOLVED as terminal backend status", () => {
    const mapped = mapAlertDto({
      alertSeq: "13",
      id: "a-resolved",
      facilityId: "fac_happy_nokyang",
      residentId: null,
      cameraId: "cam_sp_201",
      spaceId: "sp_201",
      room: "201호",
      type: "fall",
      probability: 0.9,
      detectedAt: "2026-06-22T00:00:03.000Z",
      status: "RESOLVED",
    });

    expect(mapped.backendStatus).toBe("RESOLVED");
    expect(mapped.kakaoAlertStatus).toBe("ACKNOWLEDGED");
  });

  it("keeps the backend event type string when the frontend domain maps it to OTHER", () => {
    const mapped = mapAlertDto({
      alertSeq: "14",
      id: "a-unknown",
      facilityId: "fac_happy_nokyang",
      residentId: null,
      cameraId: "cam_sp_201",
      spaceId: "sp_201",
      room: "201호",
      type: "door-open-too-long",
      probability: 0.7,
      detectedAt: "2026-06-22T00:00:04.000Z",
      status: "NEW",
    });

    expect(mapped.eventType).toBe("OTHER");
    expect(mapped.backendType).toBe("door-open-too-long");
  });
});

describe("alerts API seam", () => {
  const baseDto: AlertDto = {
    alertSeq: "seq-1",
    id: "a1",
    facilityId: "f1",
    residentId: "r1",
    cameraId: null,
    spaceId: "s1",
    room: "101호",
    type: "fall",
    probability: 0.91,
    snapshotKey: null,
    detectedAt: "2026-06-27T01:00:00.000Z",
    status: "NEW",
    ackedById: null,
    ackedAt: null,
    ackedBy: null,
    resolvedById: null,
    resolvedAt: null,
    resolvedBy: null,
    resident: { name: "김어르신" },
    space: { name: "101호" },
    createdAt: "2026-06-27T01:00:00.000Z",
  };

  beforeEach(() => {
    requestJsonMock.mockReset();
  });

  it("maps a NEW alert without collapsing lifecycle status", () => {
    const alert = mapAlert(baseDto);

    expect(alert.status).toBe("NEW");
    expect(alert.kakaoAlertStatus).toBe("SENT");
  });

  it("maps an ACKED alert with legacy acknowledged badge and actor name", () => {
    const alert = mapAlert({
      ...baseDto,
      status: "ACKED",
      ackedById: "u1",
      ackedAt: "2026-06-27T01:05:00.000Z",
      ackedBy: { nickname: "간호사A" },
    });

    expect(alert.status).toBe("ACKED");
    expect(alert.kakaoAlertStatus).toBe("ACKNOWLEDGED");
    expect(alert.ackedByName).toBe("간호사A");
  });

  it("preserves RESOLVED while mapping the legacy badge to acknowledged", () => {
    const alert = mapAlert({
      ...baseDto,
      status: "RESOLVED",
      resolvedById: "u2",
      resolvedAt: "2026-06-27T01:10:00.000Z",
      resolvedBy: { nickname: "간호사B" },
    });

    expect(alert.status).toBe("RESOLVED");
    expect(alert.kakaoAlertStatus).toBe("ACKNOWLEDGED");
  });
  it("accepts a room-level alert without resident fields and omits residentId query", async () => {
    requestJsonMock.mockResolvedValue([
      {
        id: "a-room",
        facilityId: "f1",
        spaceId: "s1",
        detectedAt: "2026-06-27T01:00:00.000Z",
        probability: 0.82,
      },
    ]);

    const [alert] = await listAlertsEndpoint({ residentId: "r1", limit: 10 });

    expect(requestJsonMock).toHaveBeenCalledWith("/alerts?limit=10");
    expect(alert.residentId).toBeNull();
    expect(alert.residentName).toBeNull();
  });


  it("resolves an alert through the PATCH endpoint", async () => {
    requestJsonMock.mockResolvedValue({ ...baseDto, status: "RESOLVED" });

    await resolveAlertEndpoint("a1");

    expect(requestJsonMock).toHaveBeenCalledWith("/alerts/a1/resolve", { method: "PATCH" });
  });

  it("throws on malformed list entries", async () => {
    requestJsonMock.mockResolvedValue([{ ...baseDto, id: 123 }]);

    await expect(listAlertsEndpoint()).rejects.toThrow("Malformed alert response");
  });
});
