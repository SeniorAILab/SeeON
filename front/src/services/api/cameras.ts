import { requestJson } from "@/services/apiClient";

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
