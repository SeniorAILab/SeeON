export function isEventClipsEnabled(
  value: string | undefined = import.meta.env.VITE_EVENT_CLIPS_ENABLED,
): boolean {
  return value === "true";
}
