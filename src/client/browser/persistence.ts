export interface StoredHandles {
  claude?: FileSystemDirectoryHandle | null;
  opencode?: FileSystemFileHandle | null;
  codex?: FileSystemFileHandle | null;
}

const DB_NAME = "tokenmaxxx";
const STORE = "sources";
const KEY = "main";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => resolve(null);
  });
}

export async function loadHandles(): Promise<StoredHandles> {
  const stored = await tx<StoredHandles>("readonly", (s) => s.get(KEY));
  return stored ?? {};
}

export async function saveHandles(h: StoredHandles): Promise<void> {
  await tx("readwrite", (s) => s.put(h, KEY));
}

export async function clearHandles(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY));
}
