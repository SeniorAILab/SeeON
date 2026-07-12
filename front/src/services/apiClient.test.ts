import { beforeEach, describe, expect, it, vi } from "vitest";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// 스코프 픽스처는 파일당 상수 하나에서만 유도한다 — 경로/단언이 같은 리터럴의
// 수기 일치에 의존하지 않게 한다 (front/src/AGENTS.md 컨벤션).
const SCOPED_FACILITY_ID = "fac_happy_nokyang";
const SCOPED_FACILITY_PATH = `/facilities/${SCOPED_FACILITY_ID}`;

describe("apiClient.requestJson", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults to backend session cookie mode", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/default-probe");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/default-probe",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("defaults requestNoContent to backend session cookie mode", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestNoContent } = await import("./apiClient");
    await requestNoContent("/no-content-probe");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/no-content-probe",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("sends the backend session cookie for authenticated requests", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/cameras");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/cameras",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("keeps explicit caller credential overrides intact", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/public-probe", { credentials: "omit" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/public-probe",
      expect.objectContaining({ credentials: "omit" })
    );
  });

  it("prefixes auth identity paths with the default /api/v1 base", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("notifies the unauthorized handler on 401 responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson, setUnauthorizedHandler } = await import("./apiClient");
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(requestJson("/protected")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("applies endpoint-specific facility scope headers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(okJsonResponse({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const { useFacilityStore } = await import("@/stores/facilityStore");
    const { requestJson } = await import("./apiClient");
    useFacilityStore.getState().setFacility(SCOPED_FACILITY_ID);

    await requestJson("/auth/me");
    await requestJson("/facilities");
    await requestJson(SCOPED_FACILITY_PATH);
    await requestJson("/dashboard");
    await requestJson("/alerts");
    await requestJson("/spaces");
    await requestJson("/floors");

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      headers: new Headers(init?.headers),
    }));
    expect(calls.find((call) => call.url.endsWith("/auth/me"))?.headers.has("x-facility-id")).toBe(false);
    const facilitiesListCall = calls.find((call) => call.url.endsWith("/api/v1/facilities"));
    expect(facilitiesListCall?.headers.has("x-facility-id")).toBe(false);
    for (const path of [SCOPED_FACILITY_PATH, "/dashboard", "/alerts", "/spaces", "/floors"]) {
      expect(calls.find((call) => call.url.endsWith(path))?.headers.get("x-facility-id")).toBe(SCOPED_FACILITY_ID);
    }

    useFacilityStore.getState().clearFacility();
    await requestJson("/dashboard");
    const clearCall = fetchMock.mock.calls.at(-1)?.[1];
    expect(new Headers(clearCall?.headers).has("x-facility-id")).toBe(false);
  });

  it("test_build_sse_url_uses_dashboard_stream_path", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl()).toBe("/api/v1/dashboard/stream");
    expect(buildSseUrl()).not.toContain(["", "api", "v1", "sse"].join("/"));
    expect(isAbsoluteApiUrl(buildSseUrl())).toBe(false);
  });

  it("adds the selected facility scope to the dashboard stream URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);

    const { useFacilityStore } = await import("@/stores/facilityStore");
    const { buildSseUrl } = await import("./apiClient");
    useFacilityStore.getState().setFacility(SCOPED_FACILITY_ID);

    expect(buildSseUrl()).toBe(
      `/api/v1/dashboard/stream?facilityId=${SCOPED_FACILITY_ID}`
    );
  });

  it("builds an absolute dashboard stream SSE URL when VITE_API_BASE_URL is absolute", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl()).toBe("http://localhost:8080/api/v1/dashboard/stream");
    expect(buildSseUrl()).not.toContain(["", "api", "v1", "sse"].join("/"));
    expect(isAbsoluteApiUrl(buildSseUrl())).toBe(true);
  });

  it("adds the selected facility scope to absolute dashboard stream URLs", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl(SCOPED_FACILITY_ID)).toBe(
      `http://localhost:8080/api/v1/dashboard/stream?facilityId=${SCOPED_FACILITY_ID}`
    );
    expect(isAbsoluteApiUrl(buildSseUrl(SCOPED_FACILITY_ID))).toBe(true);
  });
});
