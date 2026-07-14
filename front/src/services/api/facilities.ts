import { requestJson } from "@/services/apiClient";
import { getCurrentFacilityId } from "@/stores/facilityStore";
import type { Facility } from "@/types";

type FacilityResponse = Omit<Facility, "address" | "phone"> & {
  address: string | null;
  phone: string | null;
};

function normalizeFacility(facility: FacilityResponse): Facility {
  return {
    ...facility,
    address: facility.address ?? "",
    phone: facility.phone ?? "",
  };
}

function expectArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field} response`);
  return value as T[];
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

export async function getFacility(id: string): Promise<Facility> {
  const facilityId = getCurrentFacilityId();
  return normalizeFacility((await requestJson(`/facilities/${pathSegment(id)}`, {
    headers: facilityId ? { "X-Facility-Id": facilityId } : {},
  })) as FacilityResponse);
}

export async function updateFacility(
  id: string,
  input: Pick<Facility, "name" | "address" | "phone">,
): Promise<Facility> {
  const facilityId = getCurrentFacilityId();
  return normalizeFacility((await requestJson(`/facilities/${pathSegment(id)}`, {
    method: "PATCH",
    headers: facilityId ? { "X-Facility-Id": facilityId } : {},
    body: JSON.stringify(input),
  })) as FacilityResponse);
}

export async function listFacilities(): Promise<Facility[]> {
  return expectArray<FacilityResponse>(await requestJson("/facilities"), "facilities").map(normalizeFacility);
}
