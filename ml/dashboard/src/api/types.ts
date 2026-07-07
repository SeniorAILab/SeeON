export type CameraStatus = 'online' | 'offline' | 'starting' | 'unknown';

export type Camera = {
  id: string;
  label: string;
  rtsp_url_masked: string;
  space_id: string | null;
  backend_camera_id: string | null;
  status: CameraStatus;
  created_at: string;
  threshold?: number | null;
  domains?: Record<string, boolean> | null;
  bed_count?: number | null;
  night_start?: string | null;
  night_end?: string | null;
};

export type CameraRegistry = {
  registry_version: number;
  cameras: Camera[];
};

export type CameraInput = {
  label: string;
  rtsp_url: string;
  space_id?: string;
};

export type CameraPatchInput = Partial<CameraInput> & {
  detectionSettings?: {
    threshold: number;
    domains: Record<string, boolean>;
    bedCount: number;
    nightWindow: { start: string; end: string };
  };
};

export type CameraTestResult = {
  ok: boolean;
  error_class?: 'timeout' | 'decode' | 'auth' | string;
  width?: number;
  height?: number;
};

export type SystemSnapshot = {
  backend: {
    configured: boolean;
    reachable: boolean | null;
    last_ok_at: string | null;
  };
  version: string;
  image_digests?: {
    ml_api: string | null;
    ml_worker: string | null;
  };
  storage?: {
    clip_store?: {
      total_bytes: number | null;
      used_bytes: number | null;
      used_pct: number | null;
    };
  };
  update_history?: Array<{ id?: string; version?: string; created_at?: string; status?: string }>;
  rollback_history?: Array<{ id?: string; version?: string; created_at?: string; status?: string }>;
};

export type ClipLabel = 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'UNREVIEWED';

export type Clip = {
  id: string;
  camera_id: string | null;
  camera_label: string;
  event_type: string;
  created_at: string | null;
  label: ClipLabel | null;
  video_path: string;
};
