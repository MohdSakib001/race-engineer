/**
 * Phrase Audio Cache
 *
 * Caches Edge-TTS base64 audio in IndexedDB so repeated engineer phrases
 * play instantly on later hits. Keyed by `${voice}:${sha1(text)}`.
 *
 * Edge TTS is already free, so the cache isn't about cost — it's about
 * latency (avoids a WebSocket roundtrip per phrase) and skipping voice calls
 * while offline.
 */

const DB_NAME = 'apex-engineer-cache';
const DB_VERSION = 1;
const STORE = 'phrase-audio';
const MAX_ENTRIES = 400;         // LRU cap
const MAX_TEXT_LENGTH = 140;      // don't cache long dynamic messages

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('lastUsed', 'lastUsed');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function sha1(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function cacheKey(voice: string, hash: string): string {
  return `${voice}:${hash}`;
}

interface PhraseEntry {
  key: string;
  voice: string;
  text: string;
  audioBase64: string;
  lastUsed: number;
  hits: number;
}

export async function getCached(voice: string, text: string): Promise<string | null> {
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  try {
    const db = await openDb();
    const hash = await sha1(text.trim().toLowerCase());
    const key = cacheKey(voice, hash);
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      const getReq = s.get(key);
      getReq.onsuccess = () => {
        const rec = getReq.result as PhraseEntry | undefined;
        if (!rec) return resolve(null);
        rec.lastUsed = Date.now();
        rec.hits = (rec.hits ?? 0) + 1;
        s.put(rec);
        resolve(rec.audioBase64);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    return null;
  }
}

export async function putCached(voice: string, text: string, audioBase64: string): Promise<void> {
  if (!text || text.length > MAX_TEXT_LENGTH) return;
  if (!audioBase64) return;
  try {
    const db = await openDb();
    const hash = await sha1(text.trim().toLowerCase());
    const key = cacheKey(voice, hash);
    const entry: PhraseEntry = {
      key, voice, text, audioBase64, lastUsed: Date.now(), hits: 1,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    void trimIfNeeded();
  } catch {
    /* ignore */
  }
}

async function trimIfNeeded(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      const countReq = s.count();
      countReq.onsuccess = () => {
        if (countReq.result <= MAX_ENTRIES) return resolve();
        const toDelete = countReq.result - MAX_ENTRIES;
        const cursorReq = s.index('lastUsed').openCursor();
        let deleted = 0;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || deleted >= toDelete) return resolve();
          cursor.delete();
          deleted += 1;
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  } catch {
    /* ignore */
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

export async function getStats(): Promise<{ entries: number; totalHits: number }> {
  try {
    const db = await openDb();
    return await new Promise<{ entries: number; totalHits: number }>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const s = tx.objectStore(STORE);
      const countReq = s.count();
      let totalHits = 0;
      countReq.onsuccess = () => {
        const cursorReq = s.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return resolve({ entries: countReq.result, totalHits });
          const rec = cursor.value as PhraseEntry;
          totalHits += rec.hits ?? 0;
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  } catch {
    return { entries: 0, totalHits: 0 };
  }
}
