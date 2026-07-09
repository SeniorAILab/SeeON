import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAlertSettings, updateAlertSettings } from "./alertSettings";
import { requestJson } from "@/services/apiClient";

vi.mock("@/services/apiClient", () => ({
  requestJson: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);

const backendSettings = {
  notificationEmail: "alerts@sen.ai",
  emailAlertsEnabled: true,
  effectiveEmail: "admin@sen.ai",
};

describe("alertSettings api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets alert settings from the real backend path", async () => {
    requestJsonMock.mockResolvedValue(backendSettings);

    await expect(getAlertSettings()).resolves.toEqual(backendSettings);
    expect(requestJsonMock).toHaveBeenCalledWith("/auth/me/alert-settings");
  });

  it("maps a null notificationEmail through", async () => {
    requestJsonMock.mockResolvedValue({ ...backendSettings, notificationEmail: null });

    await expect(getAlertSettings()).resolves.toEqual({
      ...backendSettings,
      notificationEmail: null,
    });
  });

  it("updates alert settings with PATCH body", async () => {
    requestJsonMock.mockResolvedValue({ ...backendSettings, emailAlertsEnabled: false });

    await updateAlertSettings({ notificationEmail: "alerts@sen.ai", emailAlertsEnabled: false });

    expect(requestJsonMock).toHaveBeenCalledWith("/auth/me/alert-settings", {
      method: "PATCH",
      body: JSON.stringify({ notificationEmail: "alerts@sen.ai", emailAlertsEnabled: false }),
    });
  });

  it("clears notificationEmail with an explicit null payload", async () => {
    requestJsonMock.mockResolvedValue({ ...backendSettings, notificationEmail: null });

    await updateAlertSettings({ notificationEmail: null });

    expect(requestJsonMock).toHaveBeenCalledWith("/auth/me/alert-settings", {
      method: "PATCH",
      body: JSON.stringify({ notificationEmail: null }),
    });
  });

  it("throws when the backend response is malformed", async () => {
    requestJsonMock.mockResolvedValue({ notificationEmail: "x", emailAlertsEnabled: "yes" });

    await expect(getAlertSettings()).rejects.toThrow(/emailAlertsEnabled/);
  });
});
