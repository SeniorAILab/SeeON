import { requestJson } from "@/services/apiClient";
import type { AlertLifecycleStatus, AlertStatus, AlertView, DetectionEvent, DetectionEventType, Level } from "@/types";

export interface BackendAlertDto {
  alertSeq: string | number;
  id: string;
  backendEventId?: string | null;
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
    backendEventId: asNullableString(dto.backendEventId),
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
    emergency: eventType === "FALL_RISK",
    backendStatus: dto.status,
    backendType: type,
  };
}

export async function listAlerts(): Promise<FrontendAlert[]> {
  const body = await requestJson("/alerts");
  if (!Array.isArray(body)) throw new Error("Invalid alerts response");
  return body.map((item) => mapAlertDto(item as BackendAlertDto));
}

/**
 * 이벤트 목록용 — 서버가 나눠 주는 페이지를 끝까지 따라가 전부 모은다.
 *
 * `listAlerts()`는 파라미터 없이 부르므로 서버 기본값 50건만 온다
 * (`backend/src/alerts/alerts.service.ts:31`). 실제 시설에는 수백 건이
 * 쌓여 있어서, 목록 화면이 조용히 최근 50건만 보여주고 나머지는 없는 것처럼
 * 된다. 요양원에서 "지난주 그 사건"을 찾으려는 사람에게는 사라진 것과 같다.
 *
 * 대시보드(`dashboardEndpoints.ts`)는 지금 상태만 필요하므로 계속
 * `listAlerts()`를 쓴다. 실시간 갱신마다 전체를 끌면 낭비다.
 *
 * 서버는 `alertSeq desc`로 주고 `beforeSeq`로 그보다 오래된 것을 준다
 * (`alerts.controller.ts:54`, `alerts.service.ts:35,47`). 그래서 마지막
 * 항목의 `alertSeq`를 다음 커서로 넘긴다.
 */
export async function listAllAlerts(): Promise<FrontendAlert[]> {
  // 서버 상한이 200이다(`alerts.service.ts:32`). 그보다 크게 요청해도 잘린다.
  const PAGE = 200;
  // 끝나지 않는 응답에 갇히지 않도록 상한을 둔다. 200 * 50 = 10,000건이면
  // 이 화면이 감당할 범위를 이미 넘어선다.
  const MAX_PAGES = 50;

  const collected: FrontendAlert[] = [];
  const seen = new Set<string>();
  let beforeSeq: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = beforeSeq === undefined
      ? `/alerts?limit=${PAGE}`
      : `/alerts?limit=${PAGE}&beforeSeq=${encodeURIComponent(beforeSeq)}`;
    const body = await requestJson(query);
    if (!Array.isArray(body)) throw new Error("Invalid alerts response");
    if (body.length === 0) break;

    const mapped = body.map((item) => mapAlertDto(item as BackendAlertDto));
    for (const alert of mapped) {
      // 커서가 겹쳐 같은 건이 두 번 와도 목록에 중복으로 쌓지 않는다.
      if (seen.has(alert.id)) continue;
      seen.add(alert.id);
      collected.push(alert);
    }

    // 한 페이지를 다 못 채웠으면 마지막 페이지다.
    if (body.length < PAGE) break;

    const next = mapped[mapped.length - 1]?.alertSeq;
    // 커서를 못 얻으면 같은 페이지를 무한히 다시 부르게 되므로 멈춘다.
    if (!next || next === beforeSeq) break;
    beforeSeq = next;
  }

  return collected;
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

/**
 * 확인(ACK)은 해결(RESOLVE)과 **다른 라우트**다.
 *
 * 예전에는 `acknowledgeAlert = resolveAlert` 별칭이라, 요양보호사가 TV에서
 * "확인"을 누르는 순간 알림이 RESOLVED로 끝나 버렸다. 정상 UI에서 ACKED가
 * 생성되지 않아 확인됨/해결완료 2단계가 통째로 죽어 있었다.
 */
export async function acknowledgeAlert(id: string): Promise<FrontendAlert> {
  const body = await requestJson(`/alerts/${encodeURIComponent(id)}/ack`, {
    method: "PATCH",
  });
  return mapAlertDto(body as BackendAlertDto);
}

/**
 * GET `/alerts/:id` — 단건 직접 조회.
 *
 * 예전에는 상세를 목록에서 찾았는데, 목록이 기본 50건이라 그 밖의 사건은
 * 영영 열리지 않고 "불러오는 중"에 갇혔다(프로덕션 이벤트 370건).
 */
export async function getAlertById(id: string): Promise<FrontendAlert> {
  const body = await requestJson(`/alerts/${encodeURIComponent(id)}`);
  return mapAlertDto(body as BackendAlertDto);
}

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
  backendEventId?: string | null;
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
    backendEventId: dto.backendEventId ?? null,
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

/**
 * PATCH `/alerts/:id/ack` — NEW → ACKED. UI 확인 버튼 전용 seam.
 * resolve와 라우트가 다르다는 점이 핵심이다.
 */
export async function ackAlertEndpoint(id: string): Promise<AlertView> {
  const body = await requestJson(`/alerts/${encodeURIComponent(id)}/ack`, {
    method: "PATCH",
  });
  return parseAlert(body);
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
