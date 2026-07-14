import { requestJson } from "@/services/apiClient";
import type { AlertLifecycleStatus, AlertStatus, AlertView, DetectionEvent, DetectionEventType, Level } from "@/types";

export interface BackendAlertDto {
  alertSeq: string | number;
  id: string;
  facilityId: string;
  residentId: string | null;
  cameraId: string | null;
  spaceId: string | null;
  room?: string | null;
  space?: { name?: string | null } | null;
  type: string;
  probability: number;
  snapshotKey?: string | null;
  detectedAt: string;
  status: string;
  resident?: unknown | null;
}

export type FrontendAlert = DetectionEvent & {
  alertSeq: string;
  residentId: string | null;
  cameraId: string | null;
  room?: string;
  backendStatus: string;
  backendType: string;
};

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid alert ${field}`);
  return value;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapEventType(type: string): DetectionEventType {
  if (type === "bed-exit") return "BED_EXIT";
  if (type === "fall") return "FALL_RISK";
  return "OTHER";
}

function mapStatus(status: string): AlertLifecycleStatus {
  switch (status) {
    case "RESOLVED":
    case "ACKED":
    case "ACKNOWLEDGED":
      return "ACKNOWLEDGED";
    case "FAILED":
      return "FAILED";
    case "SENDING":
      return "SENDING";
    case "SENT":
      return "SENT";
    case "NEW":
    default:
      return "PENDING";
  }
}

function mapRisk(probability: number, type: string): Level {
  if (type === "fall" || type === "bed-exit") return "HIGH";
  if (probability >= 0.8) return "HIGH";
  if (probability >= 0.5) return "MEDIUM";
  return "LOW";
}

export function mapAlertDto(dto: BackendAlertDto): FrontendAlert {
  const id = asString(dto.id, "id");
  const facilityId = asString(dto.facilityId, "facilityId");
  const type = asString(dto.type, "type");
  const probability = Number(dto.probability);
  if (!Number.isFinite(probability)) throw new Error("Invalid alert probability");
  const room = dto.room ?? dto.space?.name ?? undefined;
  const spaceId = asNullableString(dto.spaceId) ?? "";
  if (!spaceId) throw new Error("Invalid alert spaceId");
  const eventType = mapEventType(type);
  const alertStatus = mapStatus(dto.status);

  return {
    id,
    alertSeq: String(dto.alertSeq),
    facilityId,
    residentId: asNullableString(dto.residentId),
    cameraId: asNullableString(dto.cameraId),
    spaceId,
    room: room ?? undefined,
    eventType,
    riskLevel: mapRisk(probability, type),
    message: eventType === "BED_EXIT" ? `${room ?? "호실"} 침상 이탈 감지` : `${room ?? "공간"} 위험 이벤트 감지`,
    aiSummary: eventType === "BED_EXIT" ? "침상 이탈이 감지되었습니다." : "위험 이벤트가 감지되었습니다.",
    detectedAt: asString(dto.detectedAt, "detectedAt"),
    alertStatus,
    acknowledgedAt: alertStatus === "ACKNOWLEDGED" ? new Date().toISOString() : undefined,
    actions: [],
    confidence: probability,
    emergency: eventType === "BED_EXIT" || eventType === "FALL_RISK",
    backendStatus: dto.status,
    backendType: type,
  };
}

export async function listAlerts(): Promise<FrontendAlert[]> {
  const body = await requestJson("/alerts");
  if (!Array.isArray(body)) throw new Error("Invalid alerts response");
  return body.map((item) => mapAlertDto(item as BackendAlertDto));
}

export async function fetchActiveAlertSnapshot(): Promise<FrontendAlert[]> {
  const body = await requestJson("/alerts?status=NEW");
  if (!Array.isArray(body)) throw new Error("Invalid active alerts response");
  return body.map((item) => mapAlertDto(item as BackendAlertDto));
}

/**
 * Hits the same PATCH `/alerts/:id/resolve` route as resolveAlertEndpoint, but parses FrontendAlert for event/monitor flows via resolveAlert/acknowledgeAlert.
 */
async function requestResolve(id: string): Promise<unknown> {
  return requestJson(`/alerts/${encodeURIComponent(id)}/resolve`, { method: "PATCH" });
}

export async function resolveAlert(id: string): Promise<FrontendAlert> {
  return mapAlertDto((await requestResolve(id)) as BackendAlertDto);
}

export const acknowledgeAlert = resolveAlert;

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
    // Canonical status mapping (shared with mapAlertDto) — see mapStatus; NEW -> PENDING.
    alertStatus: mapStatus(dto.status ?? "NEW"),
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

/**
 * Hits the same PATCH `/alerts/:id/resolve` route as resolveAlert, but parses AlertView for the UI resolve seam.
 */
export async function resolveAlertEndpoint(id: string): Promise<AlertView> {
  return parseAlert(await requestResolve(id));
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
