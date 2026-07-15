/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_EVENT_CLIPS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
