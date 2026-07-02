export type VideoStorageStatus =
  | "PROCESSING"
  | "AVAILABLE"
  | "EXPIRED"
  | "DELETED";

export type VideoAccessLevel = "ADMIN_ONLY";

export type VideoAccessAction =
  | "VIEW"
  | "PLAY"
  | "FULLSCREEN"
  | "DOWNLOAD_BLOCKED";

export interface VideoClip {
  id: string;
  eventId: string;
  facilityId: string;
  spaceId: string;
  cameraId: string;
  clipUrl: string;
  thumbnailUrl: string;
  detectedAt: string;
  clipStartAt: string;
  clipEndAt: string;
  durationSeconds: number;
  storageStatus: VideoStorageStatus;
  accessLevel: VideoAccessLevel;
  expiresAt: string;
  createdAt: string;
}

export interface VideoAccessLog {
  id: string;
  videoClipId: string;
  userId: string;
  userName: string;
  facilityId: string;
  action: VideoAccessAction;
  accessedAt: string;
  ipAddress: string;
  userAgent: string;
}

export interface SignedVideoUrl {
  url: string;
  expiresAt: string;
}
