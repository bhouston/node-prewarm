import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    testTimeout: 30_000,
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      thresholds: { statements: 95, branches: 85, functions: 95, lines: 95 },
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.d.ts"],
    },
  },
});
