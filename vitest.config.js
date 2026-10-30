import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: false,
        include: ["tests/**/*.test.js"],
        clearMocks: true,
        restoreMocks: true,
        testTimeout: 10000,
    },
});