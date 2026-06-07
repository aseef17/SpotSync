import type { Database } from 'sql.js';
import type { User } from '@/features/auth/types/user';
import { isIncomingCacheUpdateNewer } from '@/lib/localDb/cacheFreshness';
import { getLocalDatabase, runWriteAsync } from '@/lib/localDb/database';
import { deserializeRecord, serializeRecord } from '@/lib/localDb/serialization';

function readUserFromDb(db: Database, userId: string): User | null {
  const statement = db.prepare('SELECT data FROM user_profiles WHERE user_id = ? LIMIT 1');
  statement.bind([userId]);

  let user: User | null = null;
  if (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data === 'string') {
      user = deserializeRecord<User>(row.data);
    }
  }
  statement.free();
  return user;
}

export async function getCachedUser(userId: string): Promise<User | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  return readUserFromDb(db, userId);
}

export async function upsertCachedUser(user: User): Promise<void> {
  await runWriteAsync((db) => {
    const existing = readUserFromDb(db, user.id);
    if (!isIncomingCacheUpdateNewer(existing, user)) {
      return;
    }

    db.run(
      `INSERT INTO user_profiles (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
      [user.id, serializeRecord(user), Date.now()]
    );
  });
}

export async function patchCachedUser(userId: string, patch: Partial<User>): Promise<User | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  const existing = readUserFromDb(db, userId);
  if (!existing) {
    return null;
  }

  const updated: User = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: patch.updatedAt ?? new Date(),
  };

  await runWriteAsync((innerDb) => {
    innerDb.run(
      `INSERT INTO user_profiles (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
      [updated.id, serializeRecord(updated), Date.now()]
    );
  });

  return updated;
}
