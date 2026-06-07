const IDB_NAME = 'spotsync-local-db';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'db';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function loadSqliteBytes(): Promise<Uint8Array | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readonly');
    const store = transaction.objectStore(IDB_STORE);
    const request = store.get(IDB_KEY);

    request.onsuccess = () => {
      const value = request.result;
      resolve(value instanceof Uint8Array ? value : null);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read local database'));
    transaction.oncomplete = () => db.close();
  });
}

export async function clearSqliteBytes(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    const store = transaction.objectStore(IDB_STORE);
    const request = store.delete(IDB_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to clear local database'));
    transaction.oncomplete = () => db.close();
  });
}

export async function saveSqliteBytes(data: Uint8Array): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    const store = transaction.objectStore(IDB_STORE);
    const request = store.put(data, IDB_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to save local database'));
    transaction.oncomplete = () => db.close();
  });
}
