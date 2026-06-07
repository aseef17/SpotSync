import type { Database } from 'sql.js';
import type { Place } from '@/features/places/types/place';
import { getLocalDatabase, runWriteAsync } from '@/lib/localDb/database';
import { deserializeRecord, serializeRecord } from '@/lib/localDb/serialization';
import { toMilliseconds } from '@/utils/date';

function readPlacesFromDb(db: Database, listId: string): Place[] {
  const statement = db.prepare(
    'SELECT data FROM places WHERE list_id = ? ORDER BY updated_at DESC'
  );
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

export async function upsertCachedPlace(place: Place): Promise<void> {
  await runWriteAsync((db) => {
    upsertPlaceInDb(db, place);
  });
}

export async function upsertCachedPlaces(places: Place[]): Promise<void> {
  if (places.length === 0) {
    return;
  }

  await runWriteAsync((db) => {
    for (const place of places) {
      upsertPlaceInDb(db, place);
    }
  });
}

export async function removeCachedPlace(placeId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM places WHERE id = ?', [placeId]);
  });
}

export async function removeCachedPlacesForList(listId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM places WHERE list_id = ?', [listId]);
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

  return updated;
}
