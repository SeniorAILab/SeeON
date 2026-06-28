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
  alertSeq: string;
  id: string;
  facilityId: string;
  residentId: string | null;
  cameraId: string | null;
  spaceId: string;
  room: string;
  type: string;
  probability: number;
  snapshotKey: string | null;
  detectedAt: string;
  status: AlertStatus;
  ackedById: string | null;
  ackedAt: string | null;
  ackedBy: AlertActorDto | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolvedBy: AlertActorDto | null;
  resident: AlertResidentDto | null;
  space: AlertSpaceDto;
  createdAt: string;
}

export function isAlertDto(value: unknown): value is AlertDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.alertSeq === "string" &&
    typeof value.id === "string" &&
    typeof value.facilityId === "string" &&
    isNullableString(value.residentId) &&
    isNullableString(value.cameraId) &&
    typeof value.spaceId === "string" &&
    typeof value.room === "string" &&
    typeof value.type === "string" &&
    typeof value.probability === "number" &&
    isNullableString(value.snapshotKey) &&
    typeof value.detectedAt === "string" &&
    isAlertStatus(value.status) &&
    isNullableString(value.ackedById) &&
    isNullableString(value.ackedAt) &&
    isNullableActor(value.ackedBy) &&
    isNullableString(value.resolvedById) &&
    isNullableString(value.resolvedAt) &&
    isNullableActor(value.resolvedBy) &&
    isNullableResident(value.resident) &&
    isSpace(value.space) &&
    typeof value.createdAt === "string"
  );
}

export function mapAlert(dto: AlertDto): AlertView {
  return {
    alertSeq: dto.alertSeq,
    id: dto.id,
    facilityId: dto.facilityId,
    residentId: dto.residentId,
    cameraId: dto.cameraId,
    spaceId: dto.spaceId,
    room: dto.room,
    type: dto.type,
    probability: dto.probability,
    snapshotKey: dto.snapshotKey,
    detectedAt: dto.detectedAt,
    status: dto.status,
    ackedById: dto.ackedById,
    ackedAt: dto.ackedAt,
    ackedByName: dto.ackedBy?.nickname ?? null,
    resolvedById: dto.resolvedById,
    resolvedAt: dto.resolvedAt,
    resolvedByName: dto.resolvedBy?.nickname ?? null,
    residentName: dto.resident?.name ?? null,
    kakaoAlertStatus: dto.status === "NEW" ? "SENT" : "ACKNOWLEDGED",
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

export async function ackAlertEndpoint(id: string): Promise<AlertView> {
  return parseAlert(await requestJson(`/alerts/${id}/ack`, { method: "PATCH" }));
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
  if (params.residentId !== undefined) {
    parts.push(`residentId=${encodeURIComponent(params.residentId)}`);
  }
  if (params.limit !== undefined) {
    parts.push(`limit=${encodeURIComponent(String(params.limit))}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function isAlertStatus(value: unknown): value is AlertStatus {
  return value === "NEW" || value === "ACKED" || value === "RESOLVED";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableActor(value: unknown): value is AlertActorDto | null {
  return value === null || (isRecord(value) && typeof value.nickname === "string");
}

function isNullableResident(value: unknown): value is AlertResidentDto | null {
  return value === null || (isRecord(value) && typeof value.name === "string");
}

function isSpace(value: unknown): value is AlertSpaceDto {
  return isRecord(value) && typeof value.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
