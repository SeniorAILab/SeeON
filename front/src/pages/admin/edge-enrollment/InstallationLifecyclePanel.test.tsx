import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEdgeValidationRun,
  listEdgeValidationEvents,
  replaceEdgeInstallation,
  transferEdgeOwnership,
} from "@/services/api/edgeInstallationAdmin";
import { OneTimeCredential } from "@/services/api/edgeEnrollmentTypes";
import { InstallationLifecyclePanel } from "./InstallationLifecyclePanel";

vi.mock("@/services/api/edgeInstallationAdmin", () => ({
  createEdgeValidationRun: vi.fn(),
  listEdgeValidationEvents: vi.fn(),
  replaceEdgeInstallation: vi.fn(),
  transferEdgeOwnership: vi.fn(),
}));

const createValidationMock = vi.mocked(createEdgeValidationRun);
const listValidationEventsMock = vi.mocked(listEdgeValidationEvents);
const replaceMock = vi.mocked(replaceEdgeInstallation);
const transferMock = vi.mocked(transferEdgeOwnership);
const INSTALLATION_ID = "c72bd9a7-3e04-47ba-a8cd-a56e54f98152";
const CLIENT_REF = "8b0f5ba2-d359-4d8e-948f-e386ac40c347";
const OPERATION_ID = "0197f671-3a31-7a6c-a6e4-83ed412de801";
const VALIDATION_RUN_ID = "0197f671-3a31-7a6c-a6e4-83ed412de802";
const MANIFEST_DIGEST = "a".repeat(64);

function renderPanel(onCredential = vi.fn()) {
  return render(
    <InstallationLifecyclePanel
      edgeInstallationId={INSTALLATION_ID}
      enrollmentGeneration={2}
      onCredential={onCredential}
      onChanged={vi.fn()}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("InstallationLifecyclePanel", () => {
  it("confirms generation replacement before handing off the secret holder", async () => {
    const onCredential = vi.fn();
    const holder = new OneTimeCredential("eft_v1.7H2K9M4QXP3R." + "s".repeat(43));
    replaceMock.mockResolvedValue({
      kind: "initial",
      operation: {
        operationId: OPERATION_ID,
        status: "SUCCEEDED",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      edgeInstallationId: INSTALLATION_ID,
      previousEnrollmentGeneration: 2,
      enrollmentGeneration: 3,
      installationState: "PENDING_CLAIM",
      oneTimeCredential: holder,
    });
    renderPanel(onCredential);

    fireEvent.change(screen.getByLabelText("새 설치 참조 ID"), {
      target: { value: CLIENT_REF },
    });
    fireEvent.click(screen.getByRole("button", { name: "설치 교체" }));
    expect(replaceMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "설치 교체 확인" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    const handoff = onCredential.mock.calls.at(0);
    expect(handoff?.[0]).toBe(holder);
    expect(handoff?.[1]).toBe("설치 교체 자격");
  });

  it("runs a time-limited validation and reports only the event count", async () => {
    createValidationMock.mockResolvedValue({
      operation: {
        operationId: OPERATION_ID,
        status: "SUCCEEDED",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      validationRunId: VALIDATION_RUN_ID,
      edgeInstallationId: INSTALLATION_ID,
      enrollmentGeneration: 2,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:15:00.000Z",
    });
    listValidationEventsMock.mockResolvedValue([
      { id: CLIENT_REF, detectedAt: "2026-01-01T00:02:00.000Z" },
    ]);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "검증 실행" }));
    expect(await screen.findByText("검증 이벤트 1건")).toBeTruthy();
    expect(document.body.textContent).not.toContain(CLIENT_REF);
  });

  it("validates and confirms an ownership-transfer manifest", async () => {
    transferMock.mockResolvedValue({
      operation: {
        operationId: OPERATION_ID,
        status: "SUCCEEDED",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      edgeInstallationId: INSTALLATION_ID,
      enrollmentGeneration: 2,
      serverRevision: 4,
      transferred: { floors: 0, rooms: 0, cameras: 1 },
      appliedAt: "2026-01-01T00:05:00.000Z",
    });
    renderPanel();
    fireEvent.change(screen.getByLabelText("서버 리비전"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("매니페스트 다이제스트"), {
      target: { value: MANIFEST_DIGEST },
    });
    fireEvent.change(screen.getByLabelText("소유권 이전 매니페스트"), {
      target: {
        value: JSON.stringify([{
          kind: "CAMERA",
          edgeRef: "camera-001",
          canonicalId: CLIENT_REF,
          parentCanonicalId: INSTALLATION_ID,
        }]),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "소유권 이전" }));
    expect(transferMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "소유권 이전 확인" }));

    await waitFor(() => expect(transferMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("카메라 1개 이전 완료")).toBeTruthy();
  });
});
