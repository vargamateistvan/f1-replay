import {
  experimental_createQueryPersister,
  type AsyncStorage,
  type PersistedQuery,
} from "@tanstack/react-query-persist-client";
import {
  QUERY_PERSIST_GC_INTERVAL_MS,
  QUERY_PERSIST_MAX_AGE_MS,
} from "@/constants";
import { shouldPersistQueryKey } from "./queryPersistencePolicy";
import { runWhenIdle } from "./idle";

// Per-query IndexedDB persistence. Each query is stored under its own key and
// restored lazily the first time it runs, so app start never waits on reading
// (or parsing) the whole cache, and a write only touches the query that
// changed. Values are stored as structured clones — no JSON round-trip.
// Falls back to a no-op when IDB is blocked (private-mode Safari, etc.).

const DB_NAME = "f1-replay";
const STORE = "cache";
const KEY_PREFIX = "q";
/** Bump to discard every persisted query (e.g. after an API shape change). */
const CACHE_BUSTER = "1";
/** Single-blob cache written by the old whole-client persister. */
const LEGACY_BLOB_KEY = "f1-query-cache";
const GC_STAMP_KEY = "f1-query-cache-gc-at";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const getDb = () => (dbPromise ??= openDb());

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: "readonly" | "readwrite",
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  return request(fn(db.transaction(STORE, mode).objectStore(STORE)));
}

const idbStorage: AsyncStorage<PersistedQuery> = {
  async getItem(key) {
    return (await withStore("readonly", (s) => s.get(key))) ?? null;
  },
  async setItem(key, value) {
    try {
      await withStore("readwrite", (s) => s.put(value, key));
    } catch {
      // Quota exceeded or an uncloneable value — persistence is best-effort.
    }
  },
  async removeItem(key) {
    await withStore("readwrite", (s) => s.delete(key));
  },
  async entries() {
    const db = await getDb();
    if (!db) return [];
    const store = db.transaction(STORE).objectStore(STORE);
    const range = IDBKeyRange.bound(`${KEY_PREFIX}-`, `${KEY_PREFIX}.`, false, true);
    const [keys, values] = await Promise.all([
      request(store.getAllKeys(range)),
      request(store.getAll(range)),
    ]);
    return keys.map((k, i) => [k as string, values[i] as PersistedQuery]);
  },
};

export const queryPersister = experimental_createQueryPersister<PersistedQuery>({
  storage: idbStorage,
  prefix: KEY_PREFIX,
  buster: CACHE_BUSTER,
  maxAge: QUERY_PERSIST_MAX_AGE_MS,
  serialize: (persisted) => persisted,
  deserialize: (stored) => stored,
  filters: { predicate: (query) => shouldPersistQueryKey(query.queryKey) },
});

function readGcStamp(): number {
  try {
    return Number(localStorage.getItem(GC_STAMP_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Once the page is idle, drops the legacy single-blob cache and (at most once
 * per QUERY_PERSIST_GC_INTERVAL_MS) deletes expired persisted queries — lazy
 * restore only removes entries that are actually requested again.
 */
export function schedulePersistedCacheMaintenance(): void {
  runWhenIdle(() => {
    void Promise.resolve(idbStorage.removeItem(LEGACY_BLOB_KEY)).catch(() => {});
    if (Date.now() - readGcStamp() < QUERY_PERSIST_GC_INTERVAL_MS) return;
    void queryPersister
      .persisterGc()
      .then(() => {
        try {
          localStorage.setItem(GC_STAMP_KEY, String(Date.now()));
        } catch {
          // Ignore — GC simply runs again next visit.
        }
      })
      .catch(() => {});
  });
}
