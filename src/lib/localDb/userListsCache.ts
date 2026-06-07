import type { Database } from 'sql.js';
import type { PlaceList } from '@/features/lists/types/list';
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

function upsertUserListRows(
  db: Database,
  userId: string,
  lists: PlaceList[],
  updatedAt: number
): void {
  for (const list of lists) {
    db.run(
      `INSERT INTO user_lists (user_id, list_id, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, list_id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
      [userId, list.id, serializeRecord(list), updatedAt]
    );
    db.run(
      `INSERT INTO lists (id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
      [list.id, serializeRecord(list), updatedAt]
    );
  }
}

export async function upsertCachedUserLists(userId: string, lists: PlaceList[]): Promise<void> {
  if (lists.length === 0) {
    return;
  }

  await runWriteAsync((db) => {
    upsertUserListRows(db, userId, lists, Date.now());
  });
}

export async function writeUserListsForDashboard(
  userId: string,
  lists: PlaceList[],
  pruneOrphans: boolean
): Promise<void> {
  if (pruneOrphans) {
    await syncCachedUserLists(userId, lists);
    return;
  }

  await upsertCachedUserLists(userId, lists);
}

/** Replace the user's dashboard list rows so deleted/unsaved lists do not linger locally. */
export async function syncCachedUserLists(userId: string, lists: PlaceList[]): Promise<void> {
  await runWriteAsync((db) => {
    const listIds = lists.map((list) => list.id);

    if (listIds.length === 0) {
      db.run('DELETE FROM user_lists WHERE user_id = ?', [userId]);
      return;
    }

    const placeholders = listIds.map(() => '?').join(', ');
    db.run(`DELETE FROM user_lists WHERE user_id = ? AND list_id NOT IN (${placeholders})`, [
      userId,
      ...listIds,
    ]);

    upsertUserListRows(db, userId, lists, Date.now());
  });
}

export async function removeCachedUserListMembership(listId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM user_lists WHERE list_id = ?', [listId]);
  });
}

/** Remove one dashboard row without deleting the shared list cache entry. */
export async function removeCachedUserDashboardList(userId: string, listId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM user_lists WHERE user_id = ? AND list_id = ?', [userId, listId]);
  });
}

export async function removeCachedUserList(userId: string, listId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM user_lists WHERE user_id = ? AND list_id = ?', [userId, listId]);
    db.run('DELETE FROM lists WHERE id = ?', [listId]);
  });
}
