export const TEST_DB_URL: string;
export function startTestDb(opts?: { fresh?: boolean }): string;
export function stopTestDb(): void;
export function resetTestDb(): void;
