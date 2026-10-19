// Thin promise wrapper over IndexedDB. Works on the main thread and inside the
// import worker. Schema changes go through `migrate` keyed by version number.

export const DB_NAME = "moblog-replay";
export const DB_VERSION = 1;

export const STORES = {
  datasets: "datasets",
  chunks: "chunks",
  sessions: "sessions",
  meta: "meta",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export class StorageQuotaError extends Error {
  constructor() {
    super(
      "Your browser refused to store more data (storage quota exceeded). Delete unused datasets or sessions, or allow more site storage, then try again.",
    );
    this.name = "StorageQuotaError";
  }
}

export class StorageUnavailableError extends Error {
  constructor(detail?: string) {
    super(`Browser storage (IndexedDB) is unavailable${detail ? `: ${detail}` : ""}. Private windows and some privacy settings block it.`);
    this.name = "StorageUnavailableError";
  }
}

function migrate(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    db.createObjectStore(STORES.datasets, { keyPath: "id" });
    const chunks = db.createObjectStore(STORES.chunks, { keyPath: "key" });
    chunks.createIndex("datasetId", "datasetId", { unique: false });
    const sessions = db.createObjectStore(STORES.sessions, { keyPath: "id" });
    sessions.createIndex("datasetId", "datasetId", { unique: false });
    db.createObjectStore(STORES.meta, { keyPath: "key" });
  }
  // Future: if (oldVersion < 2) { ... }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new StorageUnavailableError());
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new StorageUnavailableError(String(e)));
      return;
    }
    req.onupgradeneeded = (ev) => migrate(req.result, ev.oldVersion);
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgraded the schema — close so it can proceed.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(new StorageUnavailableError(req.error?.message));
    req.onblocked = () => reject(new StorageUnavailableError("database upgrade blocked by another open tab"));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/** Close and forget the cached connection (tests). */
export async function closeDb() {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    // ignore
  }
  dbPromise = null;
}

function wrapError(err: unknown): Error {
  const e = err as DOMException | null;
  if (e && (e.name === "QuotaExceededError" || /quota/i.test(e.message ?? ""))) return new StorageQuotaError();
  return e instanceof Error ? e : new Error(String(err));
}

export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(wrapError(req.error));
  });
}

/**
 * Run `fn` inside one transaction and resolve once it commits. Only IDB
 * requests may be awaited inside `fn` — awaiting anything else lets the
 * transaction auto-commit early.
 */
export async function withTx<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapError(tx.error));
    tx.onabort = () => reject(wrapError(tx.error ?? new Error("Transaction aborted")));
  });
  let result: T;
  try {
    result = await fn(tx);
  } catch (e) {
    try {
      tx.abort();
    } catch {
      // already finished
    }
    await done.catch(() => undefined);
    throw wrapError(e);
  }
  await done;
  return result;
}

export async function getOne<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withTx(store, "readonly", (tx) => reqToPromise(tx.objectStore(store).get(key) as IDBRequest<T | undefined>));
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return withTx(store, "readonly", (tx) => reqToPromise(tx.objectStore(store).getAll() as IDBRequest<T[]>));
}

export async function getAllByIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
  return withTx(store, "readonly", (tx) => reqToPromise(tx.objectStore(store).index(index).getAll(key) as IDBRequest<T[]>));
}

export async function putOne<T>(store: StoreName, value: T): Promise<void> {
  await withTx(store, "readwrite", (tx) => reqToPromise(tx.objectStore(store).put(value)));
}

export async function deleteOne(store: StoreName, key: IDBValidKey): Promise<void> {
  await withTx(store, "readwrite", (tx) => reqToPromise(tx.objectStore(store).delete(key)));
}

/** Storage usage estimate, when the browser exposes it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return null;
  }
}

export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
