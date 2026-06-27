import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "..");
  const env = loadEnv(mode, envDir, "");
  const backendTarget =
    env.VITE_DEV_BACKEND_ORIGIN ??
    `http://localhost:${env.BACKEND_PORT ?? env.PORT ?? "8080"}`;

  return {
    plugins: [react()],
    envDir,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        "/api": backendTarget,
        "/auth": backendTarget,
        "/ingest": backendTarget,
      },
    },
    preview: {
      port: 3000,
      strictPort: true,
    },
    test: {
      environment: "jsdom",
      env: {
        VITE_USE_MOCK: "true",
        VITE_API_BASE_URL: "/api/v1",
      },
      globals: false,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  };
});
