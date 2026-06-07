const IDB_NAME = 'spotsync-place-photos';
const IDB_VERSION = 1;
const IDB_STORE = 'blobs';

export interface PlacePhotoBlobRecord {
  placeId: string;
  photoIndex: number;
  mimeType: string;
  blob: Blob;
  cachedAt: number;
}

function buildKey(placeId: string, photoIndex: number): string {
  return `${placeId}:${photoIndex}`;
}

function openPhotoIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open place photo IndexedDB'));
  });
}

export async function readPlacePhotoBlob(
  placeId: string,
  photoIndex: number
): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  const db = await openPhotoIdb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readonly');
    const store = transaction.objectStore(IDB_STORE);
    const request = store.get(buildKey(placeId, photoIndex));

    request.onsuccess = () => {
      const record = request.result as PlacePhotoBlobRecord | undefined;
      resolve(record?.blob ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read place photo blob'));
    transaction.oncomplete = () => db.close();
  });
}

export async function writePlacePhotoBlob(
  placeId: string,
  photoIndex: number,
  blob: Blob
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openPhotoIdb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    const store = transaction.objectStore(IDB_STORE);
    const record: PlacePhotoBlobRecord = {
      placeId,
      photoIndex,
      mimeType: blob.type || 'image/jpeg',
      blob,
      cachedAt: Date.now(),
    };
    const request = store.put(record, buildKey(placeId, photoIndex));

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to write place photo blob'));
    transaction.oncomplete = () => db.close();
  });
}

export async function deletePlacePhotoBlobs(placeId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openPhotoIdb();
  const prefix = `${placeId}:`;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    const store = transaction.objectStore(IDB_STORE);
    const keysRequest = store.getAllKeys();

    keysRequest.onsuccess = () => {
      const keys = keysRequest.result.filter(
        (key): key is string => typeof key === 'string' && key.startsWith(prefix)
      );

      if (keys.length === 0) {
        resolve();
        return;
      }

      let pending = keys.length;
      for (const key of keys) {
        const deleteRequest = store.delete(key);
        deleteRequest.onerror = () =>
          reject(deleteRequest.error ?? new Error('Failed to delete place photo blob'));
        deleteRequest.onsuccess = () => {
          pending -= 1;
          if (pending === 0) {
            resolve();
          }
        };
      }
    };

    keysRequest.onerror = () =>
      reject(keysRequest.error ?? new Error('Failed to list place photo blob keys'));
    transaction.oncomplete = () => db.close();
  });
}

export async function clearPlacePhotoIdb(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openPhotoIdb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    const store = transaction.objectStore(IDB_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to clear place photo cache'));
    transaction.oncomplete = () => db.close();
  });
}
