import { requestJson, requestNoContent } from "@/services/apiClient";
import type { Floor, ProvisioningSource } from "@/types";

export interface BackendFloorDto {
  id: string;
  facilityId: string;
  name: string;
  orderIndex: number;
  provisioningSource: ProvisioningSource;
}

export type CreateFloorInput = {
  name: string;
  orderIndex?: number;
};

export type UpdateFloorInput = Partial<CreateFloorInput>;

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid floor ${field}`);
  return value;
}

function asNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid floor ${field}`);
  return number;
}

function asProvisioningSource(value: unknown, field: string): ProvisioningSource {
  if (value !== "PRODUCT" && value !== "EDGE") throw new Error(`Invalid floor ${field}`);
  return value;
}

export function mapFloorDto(dto: BackendFloorDto): Floor {
  return {
    id: asString(dto.id, "id"),
    facilityId: asString(dto.facilityId, "facilityId"),
    name: asString(dto.name, "name"),
    orderIndex: asNumber(dto.orderIndex, "orderIndex"),
    provisioningSource: asProvisioningSource(dto.provisioningSource, "provisioningSource"),
  };
}

export async function listFloors(): Promise<Floor[]> {
  const body = await requestJson("/floors");
  if (!Array.isArray(body)) throw new Error("Invalid floors response");
  return body.map((item) => mapFloorDto(item as BackendFloorDto));
}

export async function createFloor(input: CreateFloorInput): Promise<Floor> {
  const body = await requestJson("/floors", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapFloorDto(body as BackendFloorDto);
}

export async function updateFloor(id: string, patch: UpdateFloorInput): Promise<Floor> {
  const body = await requestJson(`/floors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return mapFloorDto(body as BackendFloorDto);
}

export async function deleteFloor(id: string): Promise<void> {
  await requestNoContent(`/floors/${encodeURIComponent(id)}`, { method: "DELETE" });
}
