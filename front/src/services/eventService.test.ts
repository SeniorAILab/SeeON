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
  status: "RESOLVED",
};

const noteDto = {
  id: "note-1",
  note: "keep this",
  createdBy: "Care Staff",
  authorRole: "STAFF",
  createdAt: "2026-06-22T01:02:00.000Z",
};

describe("eventService real mode actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("routes staff confirm actions to backend alert resolve by alert id", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts/alert_201/resolve") && init?.method === "PATCH") {
        return okJsonResponse(alertDto);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { eventService } = await import("./eventService");
    const event = await eventService.addAction("alert_201", "ACKNOWLEDGED", undefined, "Care Staff");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/alerts/alert_201/resolve",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
    expect(event).toMatchObject({
      id: "alert_201",
      kakaoAlertStatus: "ACKNOWLEDGED",
      acknowledgedBy: "Care Staff",
    });
  });

  it("posts non-ack action notes and returns note history", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/alerts/alert_201/notes") && init?.method === "POST") return okJsonResponse(noteDto);
      if (url.endsWith("/alerts")) return okJsonResponse([alertDto]);
      if (url.endsWith("/alerts/alert_201")) return okJsonResponse({ ...alertDto, notes: [noteDto] });
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { eventService } = await import("./eventService");

    const event = await eventService.addAction("alert_201", "MEMO", "keep this", "Care Staff");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/alerts/alert_201/notes",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ note: "keep this" }) })
    );
    expect(event.actions[0]).toMatchObject({ note: "keep this", createdBy: "Care Staff" });
  });
});
