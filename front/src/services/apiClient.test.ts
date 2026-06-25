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
      "/api/default-probe",
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
      "/api/mock-probe",
      expect.not.objectContaining({ credentials: "include" })
    );
  });

  it("sends the backend session cookie in real Kakao login mode", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { requestJson } = await import("./apiClient");
    await requestJson("/protected-probe");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/protected-probe",
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
      "/api/public-probe",
      expect.objectContaining({ credentials: "omit" })
    );
  });
});
