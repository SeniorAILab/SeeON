import { beforeEach, describe, expect, it, vi } from "vitest";

import { alertService } from "./alertService";
import { resolveAlert } from "./api/alertEndpoints";
import { createAlertNote, listAlertNotes } from "./api/alertNotes";
import { resolveAlertEndpoint } from "./api/alertsApi";

vi.mock("./api/alertEndpoints", () => ({
  resolveAlert: vi.fn(),
}));

vi.mock("./api/alertNotes", () => ({
  createAlertNote: vi.fn(),
  listAlertNotes: vi.fn(),
}));

vi.mock("./api/alertsApi", () => ({
  listAlertsEndpoint: vi.fn(),
  resolveAlertEndpoint: vi.fn(),
}));

const resolveAlertMock = vi.mocked(resolveAlert);
const createAlertNoteMock = vi.mocked(createAlertNote);
const listAlertNotesMock = vi.mocked(listAlertNotes);
const resolveAlertEndpointMock = vi.mocked(resolveAlertEndpoint);

describe("alertService endpoint delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves alerts through api/alertEndpoints, not alertsApi", async () => {
    resolveAlertMock.mockResolvedValue({ id: "a1" } as never);

    await alertService.resolveAlertById("a1");

    expect(resolveAlertMock).toHaveBeenCalledTimes(1);
    expect(resolveAlertMock).toHaveBeenCalledWith("a1");
    expect(resolveAlertEndpointMock).not.toHaveBeenCalled();
  });

  it("creates alert notes through api/alertNotes", async () => {
    createAlertNoteMock.mockResolvedValue({ id: "n1", note: "memo" } as never);

    await alertService.createNote("a1", "memo");

    expect(createAlertNoteMock).toHaveBeenCalledTimes(1);
    expect(createAlertNoteMock).toHaveBeenCalledWith("a1", "memo");
  });

  it("lists alert notes through api/alertNotes", async () => {
    listAlertNotesMock.mockResolvedValue([{ id: "n1", note: "memo" }] as never);

    await alertService.listNotes("a1");

    expect(listAlertNotesMock).toHaveBeenCalledTimes(1);
    expect(listAlertNotesMock).toHaveBeenCalledWith("a1");
  });
});
