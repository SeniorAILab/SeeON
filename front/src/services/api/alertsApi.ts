import type { AlertStatus, AlertView } from "@/types";
import { requestJson } from "../apiClient";

interface AlertActorDto {
  nickname: string;
}

interface AlertResidentDto {
  name: string;
}

interface AlertSpaceDto {
  name: string;
}

export interface AlertDto {
  alertSeq?: string;
  id: string;
  facilityId: string;
  residentId?: string | null;
  cameraId?: string | null;
  spaceId: string;
  room?: string;
  type?: string;
  probability: number;
  snapshotKey?: string | null;
  detectedAt: string;
  status?: AlertStatus;
  ackedById?: string | null;
  ackedAt?: string | null;
  ackedBy?: AlertActorDto | null;
  resolvedById?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: AlertActorDto | null;
  resident?: AlertResidentDto | null;
  space?: AlertSpaceDto;
  createdAt?: string;
}

export function isAlertDto(value: unknown): value is AlertDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.facilityId === "string" &&
    typeof value.spaceId === "string" &&
    typeof value.detectedAt === "string" &&
    typeof value.probability === "number"
  );
}

export function mapAlert(dto: AlertDto): AlertView {
  return {
    alertSeq: dto.alertSeq ?? dto.id,
    id: dto.id,
    facilityId: dto.facilityId,
    residentId: dto.residentId ?? null,
    cameraId: dto.cameraId ?? null,
    spaceId: dto.spaceId,
    room: dto.room ?? dto.space?.name ?? dto.spaceId,
    type: dto.type ?? "fall",
    probability: dto.probability,
    snapshotKey: dto.snapshotKey ?? null,
    detectedAt: dto.detectedAt,
    status: dto.status ?? "NEW",
    ackedById: dto.ackedById ?? null,
    ackedAt: dto.ackedAt ?? null,
    ackedByName: dto.ackedBy?.nickname ?? null,
    resolvedById: dto.resolvedById ?? null,
    resolvedAt: dto.resolvedAt ?? null,
    resolvedByName: dto.resolvedBy?.nickname ?? null,
    residentName: dto.resident?.name ?? null,
    kakaoAlertStatus: (dto.status ?? "NEW") === "NEW" ? "SENT" : "ACKNOWLEDGED",
  };
}

export async function listAlertsEndpoint(params: {
  status?: AlertStatus;
  residentId?: string;
  limit?: number;
} = {}): Promise<AlertView[]> {
  const body = await requestJson(`/alerts${buildQueryString(params)}`);
  if (!Array.isArray(body)) {
    throw new Error("Malformed alerts response");
  }
  return body.map(parseAlert);
}

export async function getAlertEndpoint(id: string): Promise<AlertView> {
  return parseAlert(await requestJson(`/alerts/${encodeURIComponent(id)}`));
}


export async function resolveAlertEndpoint(id: string): Promise<AlertView> {
  return parseAlert(await requestJson(`/alerts/${id}/resolve`, { method: "PATCH" }));
}

function parseAlert(value: unknown): AlertView {
  if (!isAlertDto(value)) {
    throw new Error("Malformed alert response");
  }
  return mapAlert(value);
}

function buildQueryString(params: {
  status?: AlertStatus;
  residentId?: string;
  limit?: number;
}): string {
  const parts: string[] = [];
  if (params.status !== undefined) {
    parts.push(`status=${encodeURIComponent(params.status)}`);
  }
  if (params.limit !== undefined) {
    parts.push(`limit=${encodeURIComponent(String(params.limit))}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
