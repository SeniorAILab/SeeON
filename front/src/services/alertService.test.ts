import { beforeEach, describe, expect, it, vi } from "vitest";

import { alertService } from "./alertService";
import { resolveAlertEndpoint } from "./api/alertEndpoints";
import { createAlertNote, listAlertNotes } from "./api/alertNotes";

vi.mock("./api/alertEndpoints", () => ({
  listAlertsEndpoint: vi.fn(),
  resolveAlertEndpoint: vi.fn(),
}));

vi.mock("./api/alertNotes", () => ({
  createAlertNote: vi.fn(),
  listAlertNotes: vi.fn(),
}));

const createAlertNoteMock = vi.mocked(createAlertNote);
const listAlertNotesMock = vi.mocked(listAlertNotes);
const resolveAlertEndpointMock = vi.mocked(resolveAlertEndpoint);

describe("alertService endpoint delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves alerts through resolveAlertEndpoint", async () => {
    resolveAlertEndpointMock.mockResolvedValue({ id: "a1" } as never);

    await alertService.resolve("a1");

    expect(resolveAlertEndpointMock).toHaveBeenCalledTimes(1);
    expect(resolveAlertEndpointMock).toHaveBeenCalledWith("a1");
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
