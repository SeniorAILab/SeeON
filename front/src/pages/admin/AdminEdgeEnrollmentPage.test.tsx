import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  issueEdgeCredential,
  listEdgeCredentials,
  revokeEdgeCredential,
  rotateEdgeCredential,
} from "@/services/api/edgeEnrollments";
import { OneTimeCredential } from "@/services/api/edgeEnrollmentTypes";
import { useAuthStore } from "@/stores/authStore";
import { AdminEdgeEnrollmentPage } from "./AdminEdgeEnrollmentPage";

vi.mock("@/services/api/edgeEnrollments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api/edgeEnrollments")>();
  return {
    ...actual,
    issueEdgeCredential: vi.fn(),
    listEdgeCredentials: vi.fn(),
    revokeEdgeCredential: vi.fn(),
    rotateEdgeCredential: vi.fn(),
  };
});

const issueMock = vi.mocked(issueEdgeCredential);
const listMock = vi.mocked(listEdgeCredentials);
const revokeMock = vi.mocked(revokeEdgeCredential);
const rotateMock = vi.mocked(rotateEdgeCredential);
const FACILITY_ID = "a5ff4ed1-7e63-4a4f-9ef0-42e807d74a64";
const INSTALLATION_ID = "c72bd9a7-3e04-47ba-a8cd-a56e54f98152";
const TOKEN_ID = "7H2K9M4QXP3R";
const SECRET = ["eft_v1", TOKEN_ID, "s".repeat(43)].join(".");

const ACTIVE_CREDENTIAL = {
  tokenId: TOKEN_ID,
  prefix: "eft_v1.7H2K9M4QXP3R.[redacted]",
  lifecycle: "ACTIVE",
  edgeInstallationId: INSTALLATION_ID,
  enrollmentGeneration: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  valueState: "not-returned",
} as const;

function superAdmin() {
  useAuthStore.setState({
    user: {
      id: "super-admin",
      name: "시스템 관리자",
      email: "super@example.test",
      role: "SUPER_ADMIN",
      facilityId: null,
    },
    initialized: true,
  });
}

function renderPage() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/facilities/${FACILITY_ID}/admin/edge-enrollment`]}>
        <Routes>
          <Route
            path="/facilities/:facilityId/admin/edge-enrollment"
            element={<AdminEdgeEnrollmentPage />}
          />
          <Route path="/access-denied" element={<p>접근 권한이 없습니다.</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  listMock.mockResolvedValue([ACTIVE_CREDENTIAL]);
  superAdmin();
});

afterEach(() => {
  useAuthStore.setState({ user: null, initialized: false });
});

describe("AdminEdgeEnrollmentPage", () => {
  it("lists redacted credential lifecycle data for a super admin", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "엣지 등록 관리" })).toBeTruthy();
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ facilityId: FACILITY_ID }),
    );
    expect(screen.getByText("활성")).toBeTruthy();
    expect(screen.getByText(ACTIVE_CREDENTIAL.prefix)).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("copies an issued credential once without rendering or persisting it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    issueMock.mockResolvedValue({
      kind: "initial",
      operationId: "0197f671-3a31-7a6c-a6e4-83ed412de801",
      facilityCode: "NH-7H2K9M4QXP",
      edgeInstallationId: INSTALLATION_ID,
      enrollmentGeneration: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      oneTimeCredential: new OneTimeCredential(SECRET),
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "새 등록 자격 발급" }));

    const dialog = await screen.findByRole("dialog", { name: "일회용 자격 증명" });
    expect(within(dialog).getByText(/한 번만 복사/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET);
    expect(window.location.href).not.toContain(SECRET);
    expect(localStorage.length).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "자격 증명 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(screen.queryByRole("dialog", { name: "일회용 자격 증명" })).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("disposes an unclaimed credential when the dialog closes", async () => {
    const credential = new OneTimeCredential(SECRET);
    issueMock.mockResolvedValue({
      kind: "initial",
      operationId: "0197f671-3a31-7a6c-a6e4-83ed412de801",
      facilityCode: "NH-7H2K9M4QXP",
      edgeInstallationId: INSTALLATION_ID,
      enrollmentGeneration: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      oneTimeCredential: credential,
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "새 등록 자격 발급" }));

    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));

    expect(credential.consume()).toBeNull();
  });

  it("requires explicit confirmation before rotate and revoke mutations", async () => {
    rotateMock.mockResolvedValue({
      kind: "replay",
      operationId: "0197f671-3a31-7a6c-a6e4-83ed412de802",
      edgeInstallationId: INSTALLATION_ID,
      enrollmentGeneration: 1,
      priorTokenId: TOKEN_ID,
      graceEndsAt: "2026-01-02T00:00:00.000Z",
      replacementTokenId: "8H2K9M4QXP3R",
      replacementPrefix: "eft_v1.8H2K9M4QXP3R.[redacted]",
    });
    revokeMock.mockResolvedValue({
      operationId: "0197f671-3a31-7a6c-a6e4-83ed412de803",
      tokenId: TOKEN_ID,
      revokedAt: "2026-01-01T00:05:00.000Z",
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "토큰 교체" }));
    expect(rotateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "교체 확인" }));
    await waitFor(() => expect(rotateMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole("button", { name: "토큰 폐기" }));
    expect(revokeMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "폐기 확인" }));
    await waitFor(() => expect(revokeMock).toHaveBeenCalledTimes(1));
  });

  it("redirects non-super-admin users without loading credentials", async () => {
    useAuthStore.setState({
      user: {
        id: "facility-admin",
        name: "원장님",
        email: "admin@example.test",
        role: "ADMIN",
        facilityId: FACILITY_ID,
      },
    });

    renderPage();

    expect(await screen.findByText("접근 권한이 없습니다.")).toBeTruthy();
    expect(listMock).not.toHaveBeenCalled();
  });
});
