import type { CanonicalCandleSource, CanonicalCandleSourceSummary } from "@/lib/candleSources/candleSourceTypes";

const DB_NAME = "gotrader-ai-lab-candle-sources";
const DB_VERSION = 1;
const SOURCES_STORE = "canonical_candle_sources";
const isBrowser = () => typeof window !== "undefined" && typeof indexedDB !== "undefined";
const sessionCache = new Map<string, CanonicalCandleSource>();

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB is unavailable for canonical candle source storage."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SOURCES_STORE)) {
        db.createObjectStore(SOURCES_STORE, { keyPath: "sourceId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open canonical candle source store."));
  });

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Canonical candle source transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Canonical candle source transaction aborted."));
  });

const idbRequest = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Canonical candle source IndexedDB request failed."));
  });

export const summarizeCanonicalCandleSource = (source: CanonicalCandleSource): CanonicalCandleSourceSummary => {
  const { candles: _candles, ...summary } = source;
  return summary;
};

export async function saveCanonicalCandleSource(source: CanonicalCandleSource) {
  sessionCache.set(source.sourceId, source);
  if (!isBrowser()) {
    return { ...source, storageBackend: "memory" as const };
  }
  try {
    const db = await openDb();
    const tx = db.transaction(SOURCES_STORE, "readwrite");
    tx.objectStore(SOURCES_STORE).put(source);
    await txDone(tx);
    db.close();
    return { ...source, storageBackend: "indexeddb" as const };
  } catch {
    return { ...source, storageBackend: "session" as const };
  }
}

export async function loadCanonicalCandleSource(sourceId: string) {
  const cached = sessionCache.get(sourceId);
  if (cached) {
    return cached;
  }
  if (!isBrowser()) {
    return undefined;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(SOURCES_STORE, "readonly");
    const source = await idbRequest<CanonicalCandleSource | undefined>(tx.objectStore(SOURCES_STORE).get(sourceId));
    await txDone(tx);
    db.close();
    if (source) {
      sessionCache.set(source.sourceId, source);
    }
    return source;
  } catch {
    return undefined;
  }
}

export async function listCanonicalCandleSourceSummaries(): Promise<CanonicalCandleSourceSummary[]> {
  const sessionSources = [...sessionCache.values()].map(summarizeCanonicalCandleSource);
  if (!isBrowser()) {
    return sessionSources;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(SOURCES_STORE, "readonly");
    const rows = await idbRequest<CanonicalCandleSource[]>(tx.objectStore(SOURCES_STORE).getAll());
    await txDone(tx);
    db.close();
    return rows.map(summarizeCanonicalCandleSource);
  } catch {
    return sessionSources;
  }
}

export async function clearCanonicalCandleSource(sourceId: string) {
  sessionCache.delete(sourceId);
  if (!isBrowser()) {
    return;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(SOURCES_STORE, "readwrite");
    tx.objectStore(SOURCES_STORE).delete(sourceId);
    await txDone(tx);
    db.close();
  } catch {
    // Best-effort cache cleanup only.
  }
}
