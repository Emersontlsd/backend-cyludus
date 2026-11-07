
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.js"],
    environment: "node",
    setupFiles: [],
    testTimeout: 15000,
    hookTimeout: 15000,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
