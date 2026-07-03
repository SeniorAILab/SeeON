import { requestJson } from "@/services/apiClient";
import { getCurrentFacilityId } from "@/store/facilityStore";
import type { Facility } from "@/types";

function expectArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field} response`);
  return value as T[];
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

export async function getFacility(id: string): Promise<Facility> {
  const facilityId = getCurrentFacilityId();
  return (await requestJson(`/facilities/${pathSegment(id)}`, {
    headers: facilityId ? { "X-Facility-Id": facilityId } : {},
  })) as Facility;
}

export async function listFacilities(): Promise<Facility[]> {
  return expectArray<Facility>(await requestJson("/facilities"), "facilities");
}
