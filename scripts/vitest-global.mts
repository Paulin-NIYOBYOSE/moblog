// Vitest global setup: a throwaway PostgreSQL for the database tests.
import type { TestProject } from "vitest/node";
import { startTestDb, stopTestDb } from "./test-db.mjs";

export default function setup(project: TestProject) {
  let url: string | null = null;
  try {
    url = startTestDb();
  } catch (e) {
    console.warn(`[vitest] Database tests will be skipped: ${(e as Error).message}`);
  }
  project.provide("testDbUrl", url);
  return () => {
    if (url) stopTestDb();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    testDbUrl: string | null;
  }
}
