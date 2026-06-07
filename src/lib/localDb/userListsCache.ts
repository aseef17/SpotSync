import type { Database } from 'sql.js';
import type { PlaceList } from '@/features/lists/types/list';
import { upsertCachedList } from '@/lib/localDb/listCache';
import { getLocalDatabase, runWriteAsync } from '@/lib/localDb/database';
import { deserializeRecord, serializeRecord } from '@/lib/localDb/serialization';
import { toMilliseconds } from '@/utils/date';

function readUserListsFromDb(db: Database, userId: string): PlaceList[] {
  const statement = db.prepare('SELECT data FROM user_lists WHERE user_id = ?');
  statement.bind([userId]);

  const lists: PlaceList[] = [];
  while (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data === 'string') {
      lists.push(deserializeRecord<PlaceList>(row.data));
    }
  }
  statement.free();

  return lists.sort((a, b) => toMilliseconds(b.updatedAt) - toMilliseconds(a.updatedAt));
}

export async function getCachedUserLists(userId: string): Promise<PlaceList[] | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  const lists = readUserListsFromDb(db, userId);
  return lists.length > 0 ? lists : null;
}

export async function upsertCachedUserLists(userId: string, lists: PlaceList[]): Promise<void> {
  const nextIds = new Set(lists.map((list) => list.id));

  await runWriteAsync((db) => {
    const existing = readUserListsFromDb(db, userId);
    for (const list of existing) {
      if (!nextIds.has(list.id)) {
        db.run('DELETE FROM user_lists WHERE user_id = ? AND list_id = ?', [userId, list.id]);
      }
    }

    const now = Date.now();
    for (const list of lists) {
      db.run(
        `INSERT INTO user_lists (user_id, list_id, data, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, list_id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`,
        [userId, list.id, serializeRecord(list), now]
      );
    }
  });

  for (const list of lists) {
    await upsertCachedList(list);
  }
}

export async function removeCachedUserList(userId: string, listId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM user_lists WHERE user_id = ? AND list_id = ?', [userId, listId]);
    db.run('DELETE FROM lists WHERE id = ?', [listId]);
  });
}
