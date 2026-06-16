import { defineConfig } from "vitest/config";

// sse-utils are pure functions (no DOM/React), so the default node environment
// is enough. Add jsdom + @testing-library/react here when component/hook tests
// are introduced.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
