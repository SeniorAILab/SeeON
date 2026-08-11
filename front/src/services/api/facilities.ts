import { requestJson } from "@/services/apiClient";
import { getCurrentFacilityId } from "@/stores/facilityStore";
import type { EdgeConnectionState, Facility, FacilityEdgeStatus } from "@/types";

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

function asEdgeConnectionState(value: unknown, field: string): EdgeConnectionState {
  if (value !== "NOT_ENROLLED" && value !== "CONNECTED" && value !== "STALE") {
    throw new Error(`Invalid facility edge status ${field}`);
  }
  return value;
}

function asNullableIsoString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") {
    throw new Error(`Invalid facility edge status ${field}`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid facility edge status ${field}`);
  return number;
}

function mapEdgeStatus(dto: unknown): FacilityEdgeStatus {
  const value = dto as Record<string, unknown>;
  return {
    connectionState: asEdgeConnectionState(value.connectionState, "connectionState"),
    lastHeartbeatAt: asNullableIsoString(value.lastHeartbeatAt, "lastHeartbeatAt"),
    lastSyncedAt: asNullableIsoString(value.lastSyncedAt, "lastSyncedAt"),
    healthyCameraCount: asNumber(value.healthyCameraCount, "healthyCameraCount"),
    totalCameraCount: asNumber(value.totalCameraCount, "totalCameraCount"),
  };
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

export async function getFacilityEdgeStatus(id: string): Promise<FacilityEdgeStatus> {
  const facilityId = getCurrentFacilityId();
  return mapEdgeStatus(
    await requestJson(`/facilities/${pathSegment(id)}/edge-status`, {
      headers: facilityId ? { "X-Facility-Id": facilityId } : {},
    }),
  );
}
