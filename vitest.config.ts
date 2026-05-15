import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    testTimeout: 30_000,
    include: ["test/**/*.test.ts"],
  },
});
