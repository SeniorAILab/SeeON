import { describe, expect, it } from "vitest";
import { formatDateTime, formatTime, timeAgo } from "./format";

describe("format", () => {
  it("formats valid timestamps", () => {
    const now = new Date("2026-06-22T00:01:20.000Z");

    expect(timeAgo("2026-06-22T00:00:20.000Z", now)).toBe("1분 전");
    expect(formatDateTime("2026-06-22T00:00:20.000Z")).toContain("2026.06.22");
    expect(formatTime("2026-06-22T00:00:20.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("hides invalid timestamps instead of showing NaN", () => {
    expect(timeAgo("")).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatTime("")).toBe("—");
  });
});
