import type { StyleSession } from "../../types/style";

const DATABASE_NAME = "undefined-style-local-v1";
const DATABASE_VERSION = 1;
const SESSION_STORE = "sessions";
const MEDIA_STORE = "media";

type SessionRecord = { id: string; updatedAt: string; session: StyleSession };
type MediaRecord = { id: string; blob: Blob; createdAt: string };

function supportsIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地数据库操作失败"));
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (!supportsIndexedDb()) return null;
  const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(SESSION_STORE)) {
      const store = database.createObjectStore(SESSION_STORE, { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
    }
    if (!database.objectStoreNames.contains(MEDIA_STORE)) {
      database.createObjectStore(MEDIA_STORE, { keyPath: "id" });
    }
  };
  return requestResult(request);
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地数据库事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地数据库事务已取消"));
  });
}

export async function saveSessionRecord(session: StyleSession): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(SESSION_STORE, "readwrite");
  transaction.objectStore(SESSION_STORE).put({ id: session.id, updatedAt: session.updatedAt, session } satisfies SessionRecord);
  await transactionDone(transaction);
  database.close();
}

export async function readLatestSessionRecord(): Promise<StyleSession | null> {
  const database = await openDatabase();
  if (!database) return null;
  const records = await requestResult(database.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).getAll()) as SessionRecord[];
  database.close();
  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.session ?? null;
}

export async function saveMediaBlob(id: string, blob: Blob, createdAt = new Date().toISOString()): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(MEDIA_STORE, "readwrite");
  transaction.objectStore(MEDIA_STORE).put({ id, blob, createdAt } satisfies MediaRecord);
  await transactionDone(transaction);
  database.close();
}

export async function readMediaBlob(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  if (!database) return null;
  const record = await requestResult(database.transaction(MEDIA_STORE, "readonly").objectStore(MEDIA_STORE).get(id)) as MediaRecord | undefined;
  database.close();
  return record?.blob ?? null;
}

export async function deleteMediaBlob(id: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(MEDIA_STORE, "readwrite");
  transaction.objectStore(MEDIA_STORE).delete(id);
  await transactionDone(transaction);
  database.close();
}

export async function clearLocalDatabase(): Promise<void> {
  if (!supportsIndexedDb()) return;
  await new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("清除本地数据库失败"));
    request.onblocked = () => resolve();
  });
}
