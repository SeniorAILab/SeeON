import { requestJson } from "@/services/apiClient";
import type { Space, SpaceType } from "@/types";
// 백엔드가 아직 type/capacity를 필수로 요구해 전이적으로 전송; UI 비노출;
// 이슈: space create type/capacity 선택화·정원 폐기.

export interface BackendSpaceDto {
  id: string;
  facilityId: string;
  floorId: string;
  name: string;
  type: SpaceType;
  capacity: number;
  isActive: boolean;
  assignedStaff?: string | null;
}

export type CreateSpaceInput = {
  floorId: string;
  name: string;
  type?: SpaceType;
  capacity?: number;
  isActive?: boolean;
  assignedStaff?: string | null;
};

export type UpdateSpaceInput = Partial<CreateSpaceInput>;
const TRANSITIONAL_CREATE_SPACE_DEFAULTS = {
  type: "ROOM" as const,
  capacity: 1,
};

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid space ${field}`);
  return value;
}

function asNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid space ${field}`);
  return number;
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid space ${field}`);
  return value;
}

function asSpaceType(value: unknown): SpaceType {
  const valid: SpaceType[] = [
    "ROOM",
    "HALLWAY",
    "PROGRAM_ROOM",
    "REHAB_ROOM",
    "DINING",
    "LOBBY",
    "OFFICE",
    "NURSE_STATION",
    "ENTRANCE",
    "STORAGE",
    "STAFF_LOUNGE",
    "ETC",
  ];
  if (typeof value !== "string" || !valid.includes(value as SpaceType)) {
    throw new Error("Invalid space type");
  }
  return value as SpaceType;
}

export function mapSpaceDto(dto: BackendSpaceDto): Space {
  return {
    id: asString(dto.id, "id"),
    facilityId: asString(dto.facilityId, "facilityId"),
    floorId: asString(dto.floorId, "floorId"),
    name: asString(dto.name, "name"),
    type: asSpaceType(dto.type),
    capacity: asNumber(dto.capacity, "capacity"),
    isActive: asBoolean(dto.isActive, "isActive"),
    assignedStaff: typeof dto.assignedStaff === "string" ? dto.assignedStaff : undefined,
  };
}

export async function listSpaces(): Promise<Space[]> {
  const body = await requestJson("/spaces");
  if (!Array.isArray(body)) throw new Error("Invalid spaces response");
  return body.map((item) => mapSpaceDto(item as BackendSpaceDto));
}

export async function createSpace(input: CreateSpaceInput): Promise<Space> {
  const body = await requestJson("/spaces", {
    method: "POST",
    body: JSON.stringify({
      ...TRANSITIONAL_CREATE_SPACE_DEFAULTS,
      ...input,
    }),
  });
  return mapSpaceDto(body as BackendSpaceDto);
}

export async function updateSpace(id: string, patch: UpdateSpaceInput): Promise<Space> {
  const body = await requestJson(`/spaces/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return mapSpaceDto(body as BackendSpaceDto);
}

export async function deleteSpace(id: string): Promise<Space> {
  const body = await requestJson(`/spaces/${encodeURIComponent(id)}`, { method: "DELETE" });
  return mapSpaceDto(body as BackendSpaceDto);
}
