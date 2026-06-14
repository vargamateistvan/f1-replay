import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

// Minimal IndexedDB key-value adapter — avoids a third-party dep.
// The persister serialises the whole query cache to a single JSON string,
// so storing it in IDB (no size cap) is safer than localStorage (~5 MB).
// Falls back to a no-op adapter when IDB is blocked (private-mode Safari, etc.)
// so cache persistence degrades gracefully instead of throwing.

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('f1-replay', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('cache')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

const dbPromise = openDb()

const idbStorage = {
  async getItem(key: string): Promise<string | null> {
    const db = await dbPromise
    if (!db) return null
    return new Promise((resolve, reject) => {
      const req = db.transaction('cache').objectStore('cache').get(key)
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  },
  async setItem(key: string, value: string): Promise<void> {
    const db = await dbPromise
    if (!db) return
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite')
      tx.objectStore('cache').put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
  async removeItem(key: string): Promise<void> {
    const db = await dbPromise
    if (!db) return
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite')
      tx.objectStore('cache').delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: 'f1-query-cache',
  throttleTime: 2_000, // write at most every 2 s — location chunks update frequently
})
