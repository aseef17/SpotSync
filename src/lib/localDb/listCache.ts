import type { Database } from 'sql.js';
import type { PlaceList } from '@/features/lists/types/list';
import { isIncomingCacheUpdateNewer } from '@/lib/localDb/cacheFreshness';
import { getLocalDatabase, runWriteAsync } from '@/lib/localDb/database';
import { deserializeRecord, serializeRecord } from '@/lib/localDb/serialization';

function readListFromDb(db: Database, listId: string): PlaceList | null {
  const statement = db.prepare('SELECT data FROM lists WHERE id = ? LIMIT 1');
  statement.bind([listId]);

  let list: PlaceList | null = null;
  if (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data === 'string') {
      list = deserializeRecord<PlaceList>(row.data);
    }
  }
  statement.free();
  return list;
}

export async function getCachedList(listId: string): Promise<PlaceList | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  return readListFromDb(db, listId);
}

export async function removeCachedList(listId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM lists WHERE id = ?', [listId]);
  });
}

export async function upsertCachedList(list: PlaceList): Promise<void> {
  await runWriteAsync((db) => {
    const existing = readListFromDb(db, list.id);
    if (!isIncomingCacheUpdateNewer(existing, list)) {
      return;
    }

    db.run(
      `INSERT INTO lists (id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
      [list.id, serializeRecord(list), Date.now()]
    );
  });
}
