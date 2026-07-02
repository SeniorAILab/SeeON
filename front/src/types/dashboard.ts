import type {
  DetectionEvent,
  DetectionEventType,
  Facility,
  Floor,
  Level,
  Space,
  SpaceStatus,
} from "./entities";

export interface DashboardResponse {
  facility: Facility;
  floors: Floor[];
  spaces: Space[];
  statuses: Record<string, SpaceStatus>;
  summary: DashboardSummary;
  unacknowledgedEvents: DetectionEvent[];
}

export interface DashboardSummary {
  totalSpaces: number;
  stable: number;
  caution: number;
  danger: number;
  checkNeeded: number;
  unacknowledged: number;
}

export interface AIDetectionPayload {
  facilityCode: string;
  cameraId: string;
  spaceId: string;
  timestamp: string;
  peopleCount: number;
  movementLevel: Level;
  fallRiskLevel: Level;
  eventType: DetectionEventType;
  aiSummary: string;
  confidence: number;
}
