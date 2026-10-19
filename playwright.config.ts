import { defineConfig } from "@playwright/test";

// End-to-end tests for Replay. The web server starts a throwaway PostgreSQL
// (scripts/test-db.mjs, port 54329, data in .test-db/) with all migrations
// applied, so the app's real DATABASE_URL is never touched. Login uses
// throwaway credentials.
const PORT = 3100;
const TEST_DB_URL = "postgresql://postgres@127.0.0.1:54329/replay_test?schema=public";
// Runs against a production build by default (`next build && next start`) —
// it doesn't clash with a `next dev` you already have running. E2E_DEV=1
// uses `next dev` instead (only one dev server per folder is allowed).
const PROD = process.env.E2E_DEV !== "1";
const startDb = "node scripts/test-db.mjs start";

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalTeardown: "./e2e/teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: PROD
      ? `${startDb} && npm run build:worker && npx next build && npx next start -p ${PORT}`
      : `${startDb} && npm run build:worker && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 420_000,
    reuseExistingServer: false,
    env: {
      AUTH_SECRET: "e2e-only-secret-not-for-production-0123456789",
      AUTH_EMAIL: "e2e@replay.test",
      AUTH_PASSWORD: "e2e-password",
      DATABASE_URL: TEST_DB_URL,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
