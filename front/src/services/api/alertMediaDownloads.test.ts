import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AlertMediaDownloadError,
  downloadAlertMediaAttachment,
} from "./alertMediaDownloads";

function downloadHeaders(contentLength: number): Record<string, string> {
  return {
    "Content-Disposition": 'attachment; filename="incident-clip.mp4"',
    "Content-Length": String(contentLength),
    "Content-Type": "video/mp4",
    "Cache-Control": "private, no-store, no-transform",
    "Accept-Ranges": "bytes",
    ETag: `"sha256-${"d".repeat(64)}"`,
  };
}

describe("alert attachment response semantics", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("accepts an empty full attachment as a discriminated full result", async () => {
    stubFetchResponse(
      new Response(null, { status: 200, headers: downloadHeaders(0) }),
    );

    const result = await downloadAlertMediaAttachment({ alertId: "alert-1" });

    expect(result).toMatchObject({ kind: "full", byteLength: 0 });
    expect(result.content.size).toBe(0);
  });

  it("returns a validated partial attachment with safe range metadata", async () => {
    stubFetchResponse(
      new Response("clip", {
        status: 206,
        headers: { ...downloadHeaders(4), "Content-Range": "bytes 4-7/20" },
      }),
    );

    const result = await downloadAlertMediaAttachment({ alertId: "alert-1" });

    expect(result).toMatchObject({
      kind: "partial",
      byteLength: 4,
      range: { start: 4, end: 7, total: 20 },
    });
  });

  it.each([
    { name: "missing range", length: 4, range: undefined, body: "clip" },
    {
      name: "range length mismatch",
      length: 4,
      range: "bytes 4-8/20",
      body: "clip",
    },
    {
      name: "blob length mismatch",
      length: 3,
      range: "bytes 4-6/20",
      body: "clip",
    },
    { name: "zero partial", length: 0, range: "bytes 0-0/20", body: null },
  ])(
    "rejects malformed 206 semantics: $name",
    async ({ length, range, body }) => {
      const headers = downloadHeaders(length);
      if (range !== undefined) headers["Content-Range"] = range;
      stubFetchResponse(new Response(body, { status: 206, headers }));

      await expect(
        downloadAlertMediaAttachment({ alertId: "alert-1" }),
      ).rejects.toBeInstanceOf(AlertMediaDownloadError);
    },
  );

  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "UNAVAILABLE"],
    [410, "UNAVAILABLE"],
    [416, "RANGE_NOT_SATISFIABLE"],
  ] as const)(
    "maps HTTP %s without exposing its response body",
    async (status, code) => {
      stubFetchResponse(
        new Response("private response detail", {
          status,
          statusText: "sanitized status",
        }),
      );

      await expect(
        downloadAlertMediaAttachment({ alertId: "alert-1" }),
      ).rejects.toEqual(
        expect.objectContaining({
          name: "AlertMediaDownloadError",
          status,
          code,
          message: "Alert media attachment download failed.",
        }),
      );
    },
  );
});

function stubFetchResponse(response: Response): void {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
}
