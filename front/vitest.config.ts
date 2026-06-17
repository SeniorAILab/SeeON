import { defineConfig } from "vitest/config";

// jsdom for hook/component tests (useCrud); sse-utils pure tests run fine under it too.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
