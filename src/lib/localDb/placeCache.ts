import type { Database } from 'sql.js';
import type { Place } from '@/features/places/types/place';
import { isIncomingCacheUpdateNewer } from '@/lib/localDb/cacheFreshness';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { getLocalDatabase, runWriteAsync } from '@/lib/localDb/database';
import {
  didPlacePhotoFieldsChange,
  invalidatePlacePhotos,
  warmPlaceThumbnailCache,
} from '@/lib/localDb/placePhotoCache';
import { deserializeRecord, serializeRecord } from '@/lib/localDb/serialization';
import { getPlaceThumbnail } from '@/features/places/utils/placeHelpers';
import { toMilliseconds } from '@/utils/date';

function readPlacesFromDb(db: Database, listId: string): Place[] {
  const statement = db.prepare('SELECT data FROM places WHERE list_id = ?');
  statement.bind([listId]);

  const places: Place[] = [];
  while (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data === 'string') {
      places.push(deserializeRecord<Place>(row.data));
    }
  }
  statement.free();

  return places.sort((a, b) => toMilliseconds(b.addedAt) - toMilliseconds(a.addedAt));
}

function readPlaceFromDb(db: Database, placeId: string): Place | null {
  const statement = db.prepare('SELECT data FROM places WHERE id = ? LIMIT 1');
  statement.bind([placeId]);

  let place: Place | null = null;
  if (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data === 'string') {
      place = deserializeRecord<Place>(row.data);
    }
  }
  statement.free();
  return place;
}

function upsertPlaceInDb(db: Database, place: Place): void {
  const updatedAt = Date.now();
  db.run(
    `INSERT INTO places (id, list_id, data, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       list_id = excluded.list_id,
       data = excluded.data,
       updated_at = excluded.updated_at`,
    [place.id, place.listId, serializeRecord(place), updatedAt]
  );
}

export async function getCachedPlace(placeId: string): Promise<Place | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  return readPlaceFromDb(db, placeId);
}

export async function getCachedPlacesForList(listId: string): Promise<Place[] | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  const places = readPlacesFromDb(db, listId);
  return places.length > 0 ? places : null;
}

export async function getCachedPlaceCountForList(listId: string): Promise<number> {
  const db = await getLocalDatabase();
  if (!db) {
    return 0;
  }

  const statement = db.prepare('SELECT COUNT(*) AS count FROM places WHERE list_id = ?');
  statement.bind([listId]);

  let count = 0;
  if (statement.step()) {
    const row = statement.getAsObject() as { count?: number };
    count = typeof row.count === 'number' ? row.count : 0;
  }
  statement.free();
  return count;
}

export async function upsertCachedPlace(place: Place): Promise<void> {
  const db = await getLocalDatabase();
  const existingBeforeWrite = db ? readPlaceFromDb(db, place.id) : null;
  let didWrite = false;

  await runWriteAsync((innerDb) => {
    const existing = readPlaceFromDb(innerDb, place.id);
    if (!isIncomingCacheUpdateNewer(existing, place)) {
      return;
    }
    upsertPlaceInDb(innerDb, place);
    didWrite = true;
  });

  if (!didWrite) {
    return;
  }

  if (didPlacePhotoFieldsChange(existingBeforeWrite, place)) {
    await invalidatePlacePhotos(place.id);
  }

  warmPlaceThumbnailCache(place.listId, place.id, getPlaceThumbnail(place));
}

export async function upsertCachedPlaces(places: Place[]): Promise<void> {
  if (places.length === 0) {
    return;
  }

  const db = await getLocalDatabase();
  const existingById = new Map(
    places.map((place) => [place.id, db ? readPlaceFromDb(db, place.id) : null] as const)
  );

  const wroteIds = new Set<string>();

  await runWriteAsync((innerDb) => {
    for (const place of places) {
      const existing = readPlaceFromDb(innerDb, place.id);
      if (!isIncomingCacheUpdateNewer(existing, place)) {
        continue;
      }
      upsertPlaceInDb(innerDb, place);
      wroteIds.add(place.id);
    }
  });

  for (const place of places) {
    if (!wroteIds.has(place.id)) {
      continue;
    }
    if (didPlacePhotoFieldsChange(existingById.get(place.id) ?? null, place)) {
      await invalidatePlacePhotos(place.id);
    }
    warmPlaceThumbnailCache(place.listId, place.id, getPlaceThumbnail(place));
  }
}

export async function removeCachedPlace(placeId: string): Promise<void> {
  await invalidatePlacePhotos(placeId);
  await runWriteAsync((db) => {
    db.run('DELETE FROM places WHERE id = ?', [placeId]);
  });
}

const PLACE_MUTATION_TYPES = [
  'createPlace',
  'updatePlace',
  'updatePlaceStatus',
  'deletePlace',
] as const;

/** Clears all cached places, place-related pending mutations, and photo blobs. */
export async function clearAllCachedPlaces(): Promise<void> {
  const { clearPlacePhotoCache } = await import('@/lib/localDb/placePhotoCache');
  await clearPlacePhotoCache();

  await runWriteAsync((db) => {
    db.run('DELETE FROM places');
    const placeholders = PLACE_MUTATION_TYPES.map(() => '?').join(', ');
    db.run(`DELETE FROM pending_mutations WHERE type IN (${placeholders})`, [
      ...PLACE_MUTATION_TYPES,
    ]);
  });
}

export async function removeCachedPlacesForList(listId: string): Promise<void> {
  const db = await getLocalDatabase();
  if (db) {
    const statement = db.prepare('SELECT id FROM places WHERE list_id = ?');
    statement.bind([listId]);
    while (statement.step()) {
      const row = statement.getAsObject() as { id?: string };
      if (typeof row.id === 'string') {
        await invalidatePlacePhotos(row.id);
      }
    }
    statement.free();
  }

  await runWriteAsync((innerDb) => {
    innerDb.run('DELETE FROM places WHERE list_id = ?', [listId]);
  });
}

export async function patchCachedPlace(
  placeId: string,
  patch: Partial<Place>
): Promise<Place | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  const existing = readPlaceFromDb(db, placeId);
  if (!existing) {
    return null;
  }

  if (didPlacePhotoFieldsChange(existing, patch)) {
    await invalidatePlacePhotos(placeId);
  }

  const updated: Place = {
    ...existing,
    ...patch,
    id: existing.id,
    listId: existing.listId,
    updatedAt: patch.updatedAt ?? new Date(),
  };

  await runWriteAsync((innerDb) => {
    upsertPlaceInDb(innerDb, updated);
  });

  emitChange(changeTopics.place(placeId));
  emitChange(changeTopics.placesForList(updated.listId));

  warmPlaceThumbnailCache(updated.listId, updated.id, getPlaceThumbnail(updated));

  return updated;
}
