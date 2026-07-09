import {
  getAlertSettings as getAlertSettingsEndpoint,
  updateAlertSettings as updateAlertSettingsEndpoint,
} from "./api/alertSettings";
import type { AlertSettings, UpdateAlertSettingsInput } from "./api/alertSettings";

export type { AlertSettings, UpdateAlertSettingsInput } from "./api/alertSettings";

// UI (pages/components/hooks) import this seam wrapper, not services/api/* directly
// (P7 seam ratchet: no-restricted-imports).
export function getAlertSettings(): Promise<AlertSettings> {
  return getAlertSettingsEndpoint();
}

export function updateAlertSettings(
  input: UpdateAlertSettingsInput,
): Promise<AlertSettings> {
  return updateAlertSettingsEndpoint(input);
}
