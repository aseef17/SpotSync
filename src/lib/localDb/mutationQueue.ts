import type { Database } from 'sql.js';
import { getLocalDatabase, runWriteAsync } from '@/lib/localDb/database';
import { deserializeRecord, serializeRecord } from '@/lib/localDb/serialization';
import type { MutationPayload, MutationType, PendingMutation } from '@/lib/localDb/types';
import { buildMutationKey } from '@/lib/localDb/types';

type PendingCountListener = (count: number) => void;
type LocalDataChangeListener = () => void;
const pendingCountListeners = new Set<PendingCountListener>();
const localDataChangeListeners = new Set<LocalDataChangeListener>();

const MERGE_UPDATE_TYPES = new Set<MutationType>(['updatePlace', 'updateList', 'updateUser']);

const DELETE_CANCELS_CREATE: Partial<Record<MutationType, MutationType>> = {
  deletePlace: 'createPlace',
  deleteList: 'createList',
};

function removePendingMutationsForCancelledCreate(
  db: Database,
  deleteType: MutationType,
  entityId: string
): void {
  if (deleteType === 'deleteList') {
    db.run('DELETE FROM pending_mutations WHERE entity_id = ? OR entity_id LIKE ?', [
      entityId,
      `${entityId}:%`,
    ]);
    return;
  }

  db.run('DELETE FROM pending_mutations WHERE entity_id = ?', [entityId]);
}

function mergeMutationPayload(
  type: MutationType,
  existing: MutationPayload,
  incoming: MutationPayload
): MutationPayload {
  if (type === 'updatePlace') {
    const prev = existing as { placeId: string; updates: Record<string, unknown> };
    const next = incoming as { placeId: string; updates: Record<string, unknown> };
    return {
      placeId: next.placeId,
      updates: { ...prev.updates, ...next.updates },
    } as MutationPayload;
  }

  if (type === 'updateList') {
    const prev = existing as { listId: string; updates: Record<string, unknown> };
    const next = incoming as { listId: string; updates: Record<string, unknown> };
    return {
      listId: next.listId,
      updates: { ...prev.updates, ...next.updates },
    } as MutationPayload;
  }

  if (type === 'updateUser') {
    const prev = existing as { userId: string; updates: Record<string, unknown> };
    const next = incoming as { userId: string; updates: Record<string, unknown> };
    return {
      userId: next.userId,
      updates: { ...prev.updates, ...next.updates },
    } as MutationPayload;
  }

  return incoming;
}

function readPendingMutations(db: Database): PendingMutation[] {
  const statement = db.prepare(
    'SELECT id, type, entity_id, payload, created_at, updated_at FROM pending_mutations ORDER BY updated_at ASC'
  );

  const mutations: PendingMutation[] = [];
  while (statement.step()) {
    const row = statement.getAsObject() as {
      id?: string;
      type?: string;
      entity_id?: string;
      payload?: string;
      created_at?: number;
      updated_at?: number;
    };

    if (
      typeof row.id === 'string' &&
      typeof row.type === 'string' &&
      typeof row.entity_id === 'string' &&
      typeof row.payload === 'string' &&
      typeof row.created_at === 'number' &&
      typeof row.updated_at === 'number'
    ) {
      mutations.push({
        id: row.id,
        type: row.type as MutationType,
        entityId: row.entity_id,
        payload: deserializeRecord<MutationPayload>(row.payload),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  }
  statement.free();
  return mutations;
}

async function notifyPendingCount(): Promise<void> {
  const count = await getPendingMutationCount();
  pendingCountListeners.forEach((listener) => listener(count));
}

function notifyLocalDataChange(): void {
  localDataChangeListeners.forEach((listener) => listener());
}

export function subscribeLocalDataChanges(listener: LocalDataChangeListener): () => void {
  localDataChangeListeners.add(listener);
  return () => {
    localDataChangeListeners.delete(listener);
  };
}

export function subscribePendingMutationCount(listener: PendingCountListener): () => void {
  pendingCountListeners.add(listener);
  void getPendingMutationCount().then(listener);

  return () => {
    pendingCountListeners.delete(listener);
  };
}

export async function getPendingMutationCount(): Promise<number> {
  const db = await getLocalDatabase();
  if (!db) {
    return 0;
  }

  const statement = db.prepare('SELECT COUNT(*) AS count FROM pending_mutations');
  statement.step();
  const row = statement.getAsObject() as { count?: number };
  statement.free();
  return typeof row.count === 'number' ? row.count : 0;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const db = await getLocalDatabase();
  if (!db) {
    return [];
  }

  return readPendingMutations(db);
}

function hasPendingMutation(db: Database, mutationId: string): boolean {
  const statement = db.prepare('SELECT 1 FROM pending_mutations WHERE id = ? LIMIT 1');
  statement.bind([mutationId]);
  const exists = statement.step();
  statement.free();
  return exists;
}

export async function enqueueMutation(input: {
  type: MutationType;
  entityId: string;
  payload: MutationPayload;
}): Promise<void> {
  const now = Date.now();
  const id = buildMutationKey(input.type, input.entityId);
  const cancelledCreateType = DELETE_CANCELS_CREATE[input.type];

  let skipped = false;

  await runWriteAsync((db) => {
    if (cancelledCreateType) {
      const createMutationId = buildMutationKey(cancelledCreateType, input.entityId);
      if (hasPendingMutation(db, createMutationId)) {
        removePendingMutationsForCancelledCreate(db, input.type, input.entityId);
        skipped = true;
        return;
      }
    }

    const existing = db.prepare(
      'SELECT created_at, payload FROM pending_mutations WHERE id = ? LIMIT 1'
    );
    existing.bind([id]);

    let createdAt = now;
    let payload = input.payload;
    if (existing.step()) {
      const row = existing.getAsObject() as { created_at?: number; payload?: string };
      if (typeof row.created_at === 'number') {
        createdAt = row.created_at;
      }
      if (typeof row.payload === 'string' && MERGE_UPDATE_TYPES.has(input.type)) {
        const existingPayload = deserializeRecord<MutationPayload>(row.payload);
        payload = mergeMutationPayload(input.type, existingPayload, input.payload);
      }
    }
    existing.free();

    db.run(
      `INSERT INTO pending_mutations (id, type, entity_id, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         entity_id = excluded.entity_id,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      [id, input.type, input.entityId, serializeRecord(payload), createdAt, now]
    );
  });

  if (skipped) {
    notifyLocalDataChange();
    await notifyPendingCount();
    return;
  }

  notifyLocalDataChange();
  await notifyPendingCount();
}

export async function removeMutation(mutationId: string): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM pending_mutations WHERE id = ?', [mutationId]);
  });
  notifyLocalDataChange();
  await notifyPendingCount();
}

export async function clearPendingMutations(): Promise<void> {
  await runWriteAsync((db) => {
    db.run('DELETE FROM pending_mutations');
  });
  notifyLocalDataChange();
  await notifyPendingCount();
}
