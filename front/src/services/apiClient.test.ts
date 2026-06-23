import { beforeEach, describe, expect, it, vi } from "vitest";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient.request", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the backend session cookie in real Kakao login mode", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { request } = await import("./apiClient");
    await request<{ ok: boolean }>("/protected-probe");

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

    const { request } = await import("./apiClient");
    await request<{ ok: boolean }>("/public-probe", { credentials: "omit" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public-probe",
      expect.objectContaining({ credentials: "omit" })
    );
  });
});
