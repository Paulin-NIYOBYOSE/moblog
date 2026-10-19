// Runs in every test worker before test files are imported: point Prisma at
// the throwaway test database — never at the developer's DATABASE_URL.
import { inject } from "vitest";

const url = inject("testDbUrl");
process.env.DATABASE_URL = url ?? "postgresql://invalid:invalid@127.0.0.1:1/none";
