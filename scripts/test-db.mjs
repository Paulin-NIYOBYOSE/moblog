// Throwaway PostgreSQL cluster for tests — never touches DATABASE_URL.
//
//   node scripts/test-db.mjs start   → prints the connection URL
//   node scripts/test-db.mjs stop
//
// Needs local PostgreSQL binaries (initdb, pg_ctl) on PATH or in $PG_BIN
// (e.g. `brew install postgresql@14`). Data lives in .test-db/ (git-ignored).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".test-db");
const data = path.join(dir, "data");
const PORT = Number(process.env.TEST_DB_PORT || 54329);
export const TEST_DB_URL = `postgresql://postgres@127.0.0.1:${PORT}/replay_test?schema=public`;

function bin(name) {
  const candidates = [process.env.PG_BIN && path.join(process.env.PG_BIN, name), "/opt/homebrew/bin/" + name, "/usr/local/bin/" + name, "/usr/lib/postgresql/16/bin/" + name, "/usr/lib/postgresql/14/bin/" + name].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const which = spawnSync("which", [name], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  throw new Error(`PostgreSQL binary "${name}" not found — install PostgreSQL or set PG_BIN.`);
}

function running() {
  if (!existsSync(path.join(data, "PG_VERSION"))) return false;
  return spawnSync(bin("pg_ctl"), ["-D", data, "status"], { stdio: "ignore" }).status === 0;
}

export function startTestDb({ fresh = true } = {}) {
  if (running()) stopTestDb();
  if (fresh) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path.join(data, "PG_VERSION"))) {
    execFileSync(bin("initdb"), ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"], { stdio: "ignore" });
  }
  execFileSync(bin("pg_ctl"), ["-D", data, "-l", path.join(dir, "log.txt"), "-o", `-p ${PORT} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off`, "-w", "start"], { stdio: "ignore" });
  execFileSync(bin("createdb"), ["-h", "127.0.0.1", "-p", String(PORT), "-U", "postgres", "replay_test"], { stdio: "ignore" });
  execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "ignore",
  });
  return TEST_DB_URL;
}

/** Empty Replay's tables (between end-to-end tests). */
export function resetTestDb() {
  execFileSync(bin("psql"), ["-h", "127.0.0.1", "-p", String(PORT), "-U", "postgres", "-d", "replay_test", "-q", "-c", 'TRUNCATE "ReplayJournalEntry", "ReplaySession", "ReplayCandleDay", "ReplayProviderChunk", "ReplayDataset", "ReplayMeta" CASCADE'], { stdio: "ignore" });
}

export function stopTestDb() {
  if (existsSync(path.join(data, "PG_VERSION"))) spawnSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === "start") console.log(startTestDb());
  else if (cmd === "stop") stopTestDb();
  else {
    console.error("usage: node scripts/test-db.mjs start|stop");
    process.exit(1);
  }
}
