import { beforeEach, describe, expect, it, vi } from "vitest";
const SCOPED_FACILITY_ID = "fac_happy_nokyang";


function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const alertDto = {
  alertSeq: "10",
  id: "alert_201",
  facilityId: SCOPED_FACILITY_ID,
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

    // 확인(ACK)은 해결(RESOLVE)과 다른 라우트다. 예전에는 확인이 곧바로
    // RESOLVED로 끝나 확인됨/해결완료 2단계가 죽어 있었다.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/alerts/alert_201/ack",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
    expect(event).toMatchObject({
      id: "alert_201",
      alertStatus: "ACKNOWLEDGED",
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
  it("lists facility events without loading alert notes for each event", async () => {
    const listAlertNotesMock = vi.fn();
    vi.doMock("@/services/api/alertNotes", () => ({
      createAlertNote: vi.fn(),
      listAlertNotes: listAlertNotesMock,
    }));
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      // 목록은 페이지를 끝까지 따라가므로 limit/beforeSeq가 붙는다.
      // 여기서는 한 장으로 끝나는 응답을 준다(200건 미만).
      if (String(input).includes("/alerts")) {
        return okJsonResponse([
          alertDto,
          { ...alertDto, id: "alert_202", alertSeq: "11", detectedAt: "2026-06-22T02:00:00.000Z" },
        ]);
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { eventService } = await import("./eventService");

      const events = await eventService.listByFacility(SCOPED_FACILITY_ID);

      expect(events).toHaveLength(2);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "alert_201", actions: [] }),
          expect.objectContaining({ id: "alert_202", actions: [] }),
        ]),
      );
      expect(listAlertNotesMock).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@/services/api/alertNotes");
    }
  });
});

describe("I1 — 목록 50건 밖 사건도 열린다", () => {
  it("getById는 목록이 아니라 단건 라우트를 직접 조회한다", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      // 목록 라우트를 부르면 실패시킨다 — 목록 의존이 남아 있으면 여기서 터진다.
      if (url.endsWith("/alerts")) throw new Error("목록을 조회하면 안 된다");
      if (url.endsWith("/alerts/alert_999")) return okJsonResponse(alertDto);
      if (url.endsWith("/alerts/alert_999/notes")) return okJsonResponse([]);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { eventService } = await import("./eventService");
    const event = await eventService.getById("alert_999");

    expect(event).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/alerts/alert_999",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("없는 사건은 목록을 뒤지지 않고 undefined를 돌려준다", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/alerts")) throw new Error("목록을 조회하면 안 된다");
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { eventService } = await import("./eventService");
    await expect(eventService.getById("alert_missing")).resolves.toBeUndefined();
  });
});
