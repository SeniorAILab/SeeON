import { requestJson } from "@/services/apiClient";

export interface AlertSettings {
  notificationEmail: string | null;
  emailAlertsEnabled: boolean;
  effectiveEmail: string | null;
}

export type UpdateAlertSettingsInput = Partial<{
  notificationEmail: string | null;
  emailAlertsEnabled: boolean;
}>;

function asNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Invalid alert settings ${field}`);
  return value;
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid alert settings ${field}`);
  return value;
}

function mapAlertSettingsDto(dto: unknown): AlertSettings {
  const value = dto as {
    notificationEmail?: unknown;
    emailAlertsEnabled?: unknown;
    effectiveEmail?: unknown;
  };
  return {
    notificationEmail: asNullableString(value.notificationEmail ?? null, "notificationEmail"),
    emailAlertsEnabled: asBoolean(value.emailAlertsEnabled, "emailAlertsEnabled"),
    effectiveEmail: asNullableString(value.effectiveEmail ?? null, "effectiveEmail"),
  };
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const body = await requestJson("/auth/me/alert-settings");
  return mapAlertSettingsDto(body);
}

export async function updateAlertSettings(input: UpdateAlertSettingsInput): Promise<AlertSettings> {
  const body = await requestJson("/auth/me/alert-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return mapAlertSettingsDto(body);
}
