import type { Database } from 'sql.js';
import type { Invitation } from '@/features/lists/types/invitation';
import { getLocalDatabase, runWriteAsync } from '@/lib/localDb/database';
import { deserializeRecord, serializeRecord } from '@/lib/localDb/serialization';

function readInvitationsFromDb(db: Database): Invitation[] {
  const statement = db.prepare('SELECT data FROM invitations');

  const invitations: Invitation[] = [];
  while (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data === 'string') {
      invitations.push(deserializeRecord<Invitation>(row.data));
    }
  }
  statement.free();

  return invitations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getCachedInvitations(): Promise<Invitation[]> {
  const db = await getLocalDatabase();
  if (!db) {
    return [];
  }

  return readInvitationsFromDb(db);
}

export async function upsertCachedInvitation(invitation: Invitation): Promise<void> {
  await runWriteAsync((db) => {
    db.run(
      `INSERT INTO invitations (id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
      [invitation.id, serializeRecord(invitation), Date.now()]
    );
  });
}

export async function upsertCachedInvitations(invitations: Invitation[]): Promise<void> {
  if (invitations.length === 0) {
    return;
  }

  await runWriteAsync((db) => {
    const now = Date.now();
    for (const invitation of invitations) {
      db.run(
        `INSERT INTO invitations (id, data, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`,
        [invitation.id, serializeRecord(invitation), now]
      );
    }
  });
}

export async function removeCachedInvitation(invitationId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM invitations WHERE id = ?', [invitationId]);
  });
}

export async function patchCachedInvitation(
  invitationId: string,
  patch: Partial<Invitation>
): Promise<Invitation | null> {
  const db = await getLocalDatabase();
  if (!db) {
    return null;
  }

  const statement = db.prepare('SELECT data FROM invitations WHERE id = ? LIMIT 1');
  statement.bind([invitationId]);

  let invitation: Invitation | null = null;
  if (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data === 'string') {
      invitation = deserializeRecord<Invitation>(row.data);
    }
  }
  statement.free();

  if (!invitation) {
    return null;
  }

  const updated: Invitation = { ...invitation, ...patch, id: invitation.id };
  await upsertCachedInvitation(updated);
  return updated;
}
