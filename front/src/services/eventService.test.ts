import { beforeEach, describe, expect, it, vi } from "vitest";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const alertDto = {
  alertSeq: "10",
  id: "alert_201",
  facilityId: "fac_happy_nokyang",
  residentId: null,
  cameraId: "cam_sp_201",
  spaceId: "sp_201",
  room: "201호",
  type: "bed-exit",
  probability: 0.92,
  detectedAt: "2026-06-22T01:00:00.000Z",
  status: "ACKED",
};

describe("eventService real mode actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_USE_MOCK", "false");
  });

  it("routes staff confirm actions to backend alert ack by alert id", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts/alert_201/ack") && init?.method === "PATCH") {
        return okJsonResponse(alertDto);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { eventService } = await import("./eventService");
    const event = await eventService.addAction("alert_201", "ACKNOWLEDGED", undefined, "Care Staff");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/alerts/alert_201/ack",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
    expect(event).toMatchObject({
      id: "alert_201",
      kakaoAlertStatus: "ACKNOWLEDGED",
      acknowledgedBy: "Care Staff",
    });
  });
});
