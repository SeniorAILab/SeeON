import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAlertNote, listAlertNotes } from "./alertNotes";
import { requestJson } from "@/services/apiClient";

vi.mock("@/services/apiClient", () => ({
  requestJson: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);

describe("alertNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads notes from alert detail response instead of a notes collection route", async () => {
    requestJsonMock.mockResolvedValueOnce({
      id: "alert-1",
      notes: [
        {
          note: "관리자 판단 메모",
          createdBy: "관리자",
          authorRole: "ADMIN",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
        {
          note: "요양보호사 확인 메모",
          createdBy: "요양보호사",
          authorRole: "STAFF",
          createdAt: "2026-07-03T00:01:00.000Z",
        },
      ],
    });

    await expect(listAlertNotes("alert-1")).resolves.toMatchObject([
      { type: "MEMO", note: "관리자 판단 메모", authorRole: "ADMIN" },
      { type: "MEMO", note: "요양보호사 확인 메모", authorRole: "STAFF" },
    ]);
    expect(requestJsonMock).toHaveBeenCalledWith("/alerts/alert-1");
  });

  it("writes notes to the backend notes route with the real request shape", async () => {
    requestJsonMock.mockResolvedValueOnce({
      note: "새 메모",
      createdBy: "관리자",
      authorRole: "ADMIN",
      createdAt: "2026-07-03T00:02:00.000Z",
    });

    await expect(createAlertNote("alert-1", "새 메모")).resolves.toMatchObject({
      type: "MEMO",
      note: "새 메모",
      authorRole: "ADMIN",
    });
    expect(requestJsonMock).toHaveBeenCalledWith("/alerts/alert-1/notes", {
      method: "POST",
      body: JSON.stringify({ note: "새 메모" }),
    });
  });
});
