import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ackAlertEndpoint,
  listAlertsEndpoint,
  mapAlert,
  resolveAlertEndpoint,
  type AlertDto,
} from "./alertsApi";
import { requestJson } from "../apiClient";

vi.mock("../apiClient", () => ({
  requestJson: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);

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

describe("alerts API seam", () => {
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

  it("acks an alert through the PATCH endpoint", async () => {
    requestJsonMock.mockResolvedValue({ ...baseDto, status: "ACKED" });

    await ackAlertEndpoint("a1");

    expect(requestJsonMock).toHaveBeenCalledWith("/alerts/a1/ack", { method: "PATCH" });
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
