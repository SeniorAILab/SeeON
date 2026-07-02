import type { KakaoAlertStatus } from "./entities";

export type ConnectionState =
  | "NORMAL"
  | "RECONNECTING"
  | "DELAYED"
  | "DISCONNECTED";

export type MonitorCardSize = "lg" | "xl";

export type DemoMode =
  | "AUTO"
  | "NORMAL"
  | "MEAL"
  | "PROGRAM"
  | "BEDTIME"
  | "NIGHT"
  | "RISK_DEMO";

export interface MonitorSettings {
  defaultFloorId: string;
  refreshMs: number;
  alertSound: boolean;
  nightMode: boolean;
  cardSize: MonitorCardSize;
  visibleSpaceIds: string[] | null;
  allowAllView: boolean;
  demoMode: DemoMode;
}

export type AlertStatus = "NEW" | "ACKED" | "RESOLVED";

export interface AlertView {
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
  ackedByName: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  residentName: string | null;
  kakaoAlertStatus: KakaoAlertStatus;
}
