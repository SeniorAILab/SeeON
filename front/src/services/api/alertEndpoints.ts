import { requestJson } from "@/services/apiClient";
import type { DetectionEvent, DetectionEventType, KakaoAlertStatus, Level } from "@/types";

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

function mapStatus(status: string): KakaoAlertStatus {
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
  const kakaoAlertStatus = mapStatus(dto.status);

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
    kakaoAlertStatus,
    acknowledgedAt: kakaoAlertStatus === "ACKNOWLEDGED" ? new Date().toISOString() : undefined,
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

export async function resolveAlert(id: string): Promise<FrontendAlert> {
  const body = await requestJson(`/alerts/${encodeURIComponent(id)}/resolve`, { method: "PATCH" });
  return mapAlertDto(body as BackendAlertDto);
}

export const acknowledgeAlert = resolveAlert;
