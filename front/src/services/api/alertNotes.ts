import { requestJson } from "@/services/apiClient";
import type { ActionLog, Role } from "@/types";

export interface AlertNote extends ActionLog {
  authorRole: Role;
}

function noteId(dto: Record<string, unknown>): string {
  if (typeof dto.id === "string") return dto.id;
  return [dto.createdAt, dto.createdBy, dto.note].filter((value): value is string => typeof value === "string").join(":");
}

function mapNote(value: unknown): AlertNote {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid alert notes response");
  }
  const dto = value as Record<string, unknown>;
  const role = dto.authorRole;
  if (
    typeof dto.note !== "string" ||
    typeof dto.createdBy !== "string" ||
    !(role === "SUPER_ADMIN" || role === "ADMIN" || role === "STAFF") ||
    typeof dto.createdAt !== "string"
  ) {
    throw new Error("Invalid alert notes response");
  }
  return {
    id: noteId(dto),
    type: "MEMO",
    note: dto.note,
    createdBy: dto.createdBy,
    authorRole: role,
    createdAt: dto.createdAt,
  };
}

export function mapAlertNotes(value: unknown): AlertNote[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid alert detail response");
  }
  const notes = (value as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) throw new Error("Invalid alert notes response");
  return notes.map(mapNote);
}

export async function listAlertNotes(alertId: string): Promise<AlertNote[]> {
  const body = await requestJson(`/alerts/${encodeURIComponent(alertId)}`);
  return mapAlertNotes(body);
}

export async function createAlertNote(alertId: string, note: string): Promise<AlertNote> {
  return mapNote(
    await requestJson(`/alerts/${encodeURIComponent(alertId)}/notes`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  );
}
