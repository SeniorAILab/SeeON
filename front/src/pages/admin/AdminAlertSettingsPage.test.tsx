import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAlertSettingsPage } from "./AdminAlertSettingsPage";
import { getAlertSettings, updateAlertSettings } from "@/services/alertSettingsService";

vi.mock("@/services/alertSettingsService", () => ({
  getAlertSettings: vi.fn(async () => ({
    notificationEmail: null,
    emailAlertsEnabled: true,
    effectiveEmail: "admin@sen.ai",
  })),
  updateAlertSettings: vi.fn(),
}));

const getAlertSettingsMock = vi.mocked(getAlertSettings);
const updateAlertSettingsMock = vi.mocked(updateAlertSettings);

describe("AdminAlertSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAlertSettingsMock.mockResolvedValue({
      notificationEmail: null,
      emailAlertsEnabled: true,
      effectiveEmail: "admin@sen.ai",
    });
  });

  it("loads current alert settings on mount", async () => {
    render(<AdminAlertSettingsPage />);

    expect(await screen.findByRole("heading", { name: "이메일 알림 설정" })).toBeTruthy();
    expect(getAlertSettingsMock).toHaveBeenCalledTimes(1);
    const emailInput = (await screen.findByPlaceholderText("admin@sen.ai")) as HTMLInputElement;
    expect(emailInput.value).toBe("");
    const toggle = screen.getByRole("checkbox", { name: /이메일 알림 받기/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(updateAlertSettingsMock).not.toHaveBeenCalled();
  });

  it("prefills the notification email when one is already set", async () => {
    getAlertSettingsMock.mockResolvedValueOnce({
      notificationEmail: "alerts@sen.ai",
      emailAlertsEnabled: false,
      effectiveEmail: "admin@sen.ai",
    });

    render(<AdminAlertSettingsPage />);

    expect(await screen.findByDisplayValue("alerts@sen.ai")).toBeTruthy();
    const toggle = screen.getByRole("checkbox", { name: /이메일 알림 받기/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it("toggles emailAlertsEnabled, edits the email, and saves with the right payload", async () => {
    updateAlertSettingsMock.mockResolvedValueOnce({
      notificationEmail: "alerts@sen.ai",
      emailAlertsEnabled: false,
      effectiveEmail: "admin@sen.ai",
    });

    render(<AdminAlertSettingsPage />);

    const emailInput = await screen.findByPlaceholderText("admin@sen.ai");
    fireEvent.change(emailInput, { target: { value: "alerts@sen.ai" } });

    const toggle = screen.getByRole("checkbox", { name: /이메일 알림 받기/ });
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(updateAlertSettingsMock).toHaveBeenCalledWith({
        notificationEmail: "alerts@sen.ai",
        emailAlertsEnabled: false,
      });
    });
    expect(await screen.findByText(/알림 설정이 저장되었습니다/)).toBeTruthy();
  });

  it("clears the notification email when the field is emptied", async () => {
    getAlertSettingsMock.mockResolvedValueOnce({
      notificationEmail: "alerts@sen.ai",
      emailAlertsEnabled: true,
      effectiveEmail: "admin@sen.ai",
    });
    updateAlertSettingsMock.mockResolvedValueOnce({
      notificationEmail: null,
      emailAlertsEnabled: true,
      effectiveEmail: "admin@sen.ai",
    });

    render(<AdminAlertSettingsPage />);

    const emailInput = await screen.findByDisplayValue("alerts@sen.ai");
    fireEvent.change(emailInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(updateAlertSettingsMock).toHaveBeenCalledWith({
        notificationEmail: null,
        emailAlertsEnabled: true,
      });
    });
  });

  it("shows the backend error when loading fails", async () => {
    getAlertSettingsMock.mockRejectedValueOnce(new Error("Forbidden"));

    render(<AdminAlertSettingsPage />);

    expect(await screen.findByText(/알림 설정을 불러오지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/Forbidden/)).toBeTruthy();
  });

  it("shows an error and no success message when saving fails", async () => {
    updateAlertSettingsMock.mockRejectedValueOnce(new Error("Invalid email"));

    render(<AdminAlertSettingsPage />);

    await screen.findByRole("heading", { name: "이메일 알림 설정" });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("Invalid email")).toBeTruthy();
    expect(screen.queryByText(/알림 설정이 저장되었습니다/)).toBeNull();
  });
});
