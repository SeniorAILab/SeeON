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

  it("keeps apiPrefix:false prefixless with the default /api/v1 base", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/auth/session", {}, { apiPrefix: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/session",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("builds the default SSE URL under the versioned API prefix", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl()).toBe("/api/v1/sse");
    expect(isAbsoluteApiUrl(buildSseUrl())).toBe(false);
  });

  it("builds an absolute SSE URL when VITE_API_BASE_URL is absolute", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");

    const { buildSseUrl, isAbsoluteApiUrl } = await import("./apiClient");

    expect(buildSseUrl()).toBe("http://localhost:8080/api/v1/sse");
    expect(isAbsoluteApiUrl(buildSseUrl())).toBe(true);
  });
});
