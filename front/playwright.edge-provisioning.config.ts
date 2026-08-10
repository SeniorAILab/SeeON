import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const evidenceDirectory = process.env.EDGE_PROVISIONING_EVIDENCE_DIR
  ?? fileURLToPath(new URL("../../../.omo/evidence/edge-driven-facility-provisioning/task-13/", import.meta.url));
const baseURL = process.env.EDGE_PROVISIONING_BASE_URL ?? "http://127.0.0.1:3000";
const target = new URL(baseURL);

if (target.hostname !== "127.0.0.1" && target.hostname !== "localhost") {
  throw new Error("Edge provisioning Playwright is restricted to an isolated local target.");
}

mkdirSync(evidenceDirectory, { recursive: true });

export default defineConfig({
  globalSetup: "./e2e/secret-fd-bridge.ts",
  testDir: "./e2e",
  testMatch: "edge-provisioning-live.spec.ts",
  outputDir: `${evidenceDirectory}/playwright-results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "edge-provisioning-live",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        permissions: ["clipboard-read", "clipboard-write"],
        trace: "off",
        video: "off",
        screenshot: "off",
      },
    },
  ],
});
