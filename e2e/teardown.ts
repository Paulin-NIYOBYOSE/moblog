export default async function teardown() {
  const { stopTestDb } = await import("../scripts/test-db.mjs");
  stopTestDb();
}
