import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsPage } from "./AlertsPage";
import type { AlertView } from "@/types";

vi.mock("@/services/alertService", () => ({
  alertService: {
    listRecent: vi.fn(),
    resolve: vi.fn(),
    listNotes: vi.fn(),
  },
}));

const resolvedAlert = {
  id: "alert-resolved-1",
  room: "201호",
  status: "RESOLVED",
  type: "fall",
  detectedAt: "2026-07-03T00:00:00.000Z",
  resolvedAt: "2026-07-03T00:10:00.000Z",
  resolvedByName: "요양보호사",
} as AlertView;

beforeEach(async () => {
  const { alertService } = await import("@/services/alertService");
  vi.mocked(alertService.listRecent).mockResolvedValue([resolvedAlert]);
  vi.mocked(alertService.listNotes).mockReset();
  vi.mocked(alertService.listNotes).mockResolvedValue([
    {
      id: "note-1",
      type: "MEMO",
      note: "침상 안전을 확인했습니다.",
      createdBy: "staff-1",
      authorRole: "STAFF",
      createdAt: "2026-07-03T00:05:00.000Z",
    },
  ]);
});

describe("AlertsPage resolved notes", () => {
  it("opens a read-only memo history for a resolved alert", async () => {
    const { alertService } = await import("@/services/alertService");
    render(<AlertsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "메모 보기" }));

    expect(await screen.findByRole("dialog", { name: "201호 메모 히스토리" })).toBeTruthy();
    expect(await screen.findByText("침상 안전을 확인했습니다.")).toBeTruthy();
    expect(screen.getByText(/STAFF/)).toBeTruthy();
    expect(alertService.listNotes).toHaveBeenCalledWith("alert-resolved-1");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
