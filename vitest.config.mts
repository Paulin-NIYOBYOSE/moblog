import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./scripts/vitest-global.mts"],
    setupFiles: ["./scripts/vitest-setup.mts"],
    // Database tests share one throwaway database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
