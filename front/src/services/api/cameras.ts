import { requestJson } from "@/services/apiClient";
import { STALE_CUTOFF_MS, type CameraConnection } from "@/types";

export interface CameraStatus {
  id: string;
  facilityId: string;
  spaceId: string;
  online: boolean;
  lastSeenAt: string | null;
}

function mapCamera(value: unknown): CameraStatus {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid cameras response");
  }
  const dto = value as Record<string, unknown>;
  if (
    typeof dto.id !== "string" ||
    typeof dto.facilityId !== "string" ||
    typeof dto.spaceId !== "string" ||
    typeof dto.online !== "boolean" ||
    !(dto.lastSeenAt === null || typeof dto.lastSeenAt === "string")
  ) {
    throw new Error("Invalid cameras response");
  }
  return {
    id: dto.id,
    facilityId: dto.facilityId,
    spaceId: dto.spaceId,
    online: dto.online,
    lastSeenAt: dto.lastSeenAt,
  };
}

export async function listCameras(): Promise<CameraStatus[]> {
  const body = await requestJson("/cameras");
  if (!Array.isArray(body)) throw new Error("Invalid cameras response");
  return body.map(mapCamera);
}

/**
 * `lastSeenAt` 경과시간만으로 카메라 신선도를 판정한다.
 *
 * 백엔드 `online` 필드는 쓰지 않는다. `online=false`로 바뀌는 경로가
 * `detection-lost` 이벤트 하나뿐이라 heartbeat가 완전히 끊겨도 `true`로
 * 남는다(프로덕션에서 카메라 7대가 2일째 죽었는데 전부 `online=true`였다).
 *
 * 경계는 포함이다: 정확히 `STALE_CUTOFF_MS` 경과는 `LIVE`, 1ms라도 넘으면 `STALE`.
 * `null`이거나 파싱 불가하면 "한 번도 못 봤다"이므로 `STALE`.
 */
export function resolveCameraConnection(
  lastSeenAt: string | null | undefined,
  now: number
): CameraConnection {
  if (typeof lastSeenAt !== "string" || lastSeenAt === "") return "STALE";
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return "STALE";
  return now - seen <= STALE_CUTOFF_MS ? "LIVE" : "STALE";
}

export interface SpaceFreshness {
  connection: CameraConnection;
  lastSeenAt: string | null;
}

/**
 * `spaceId → 신선도` 맵. 카메라 1대 = 방 1개 1:1 전제다.
 *
 * 같은 공간에 여러 카메라가 들어와도 조용히 깨지지 않도록 더 최근
 * `lastSeenAt`을 남긴다.
 */
export function buildFreshnessBySpace(
  cameras: CameraStatus[],
  now: number
): Record<string, SpaceFreshness> {
  const bySpace: Record<string, SpaceFreshness> = {};
  for (const camera of cameras) {
    const previous = bySpace[camera.spaceId];
    if (previous && !isNewer(camera.lastSeenAt, previous.lastSeenAt)) continue;
    bySpace[camera.spaceId] = {
      connection: resolveCameraConnection(camera.lastSeenAt, now),
      lastSeenAt: camera.lastSeenAt,
    };
  }
  return bySpace;
}

function isNewer(candidate: string | null, current: string | null): boolean {
  if (candidate === null) return false;
  if (current === null) return true;
  const a = Date.parse(candidate);
  const b = Date.parse(current);
  if (Number.isNaN(a)) return false;
  if (Number.isNaN(b)) return true;
  return a > b;
}
