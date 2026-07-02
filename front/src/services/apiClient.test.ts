import { beforeEach, describe, expect, it, vi } from "vitest";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient.requestJson", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults to backend session cookie mode when VITE_USE_MOCK is unset", async () => {
    vi.stubEnv("VITE_USE_MOCK", undefined);
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

  it("uses mock mode only when VITE_USE_MOCK is explicitly true", async () => {
    vi.stubEnv("VITE_USE_MOCK", "true");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/mock-probe");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/mock-probe",
      expect.not.objectContaining({ credentials: "include" })
    );
  });

  it("sends the backend session cookie in real Kakao login mode", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/protected-probe");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/protected-probe",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("keeps explicit caller credential overrides intact", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
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

  it("prefixes auth paths with the default /api/v1 base", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/auth/session");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/session",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("does not send client-provided facility scope headers with session-backed requests", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { useFacilityStore } = await import("@/store/facilityStore");
    const { requestJson } = await import("./apiClient");
    useFacilityStore.getState().setFacility("fac_happy_nokyang");

    await requestJson("/floors");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/floors",
      expect.objectContaining({
        credentials: "include",
        headers: expect.not.objectContaining({
          "x-facility-id": expect.any(String),
        }),
      })
    );
  });

  it("test_build_sse_url_uses_dashboard_stream_path", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl()).toBe("/api/v1/dashboard/stream");
    expect(buildSseUrl()).not.toContain(["", "api", "v1", "sse"].join("/"));
    expect(isAbsoluteApiUrl(buildSseUrl())).toBe(false);
  });

  it("does not add a client-selected facility scope to the dashboard stream URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);

    const { useFacilityStore } = await import("@/store/facilityStore");
    const { buildSseUrl } = await import("./apiClient");
    useFacilityStore.getState().setFacility("fac_happy_nokyang");

    expect(buildSseUrl()).toBe("/api/v1/dashboard/stream");
  });

  it("builds an absolute dashboard stream SSE URL when VITE_API_BASE_URL is absolute", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl()).toBe("http://localhost:8080/api/v1/dashboard/stream");
    expect(buildSseUrl()).not.toContain(["", "api", "v1", "sse"].join("/"));
    expect(isAbsoluteApiUrl(buildSseUrl())).toBe(true);
  });

  it("does not add a selected facility scope to absolute dashboard stream URLs", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl()).toBe("http://localhost:8080/api/v1/dashboard/stream");
    expect(isAbsoluteApiUrl(buildSseUrl())).toBe(true);
  });
});
