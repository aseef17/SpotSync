import { doc, updateDoc } from 'firebase/firestore';
import type { PlaceList } from '@/features/lists/types/list';
import { db } from '@/lib/firebase';

export function getExpectedCollaboratorIds(list: PlaceList): string[] {
  return Array.from(new Set([list.ownerId, ...(list.collaborators?.map((c) => c.userId) || [])]));
}

export function getExpectedEditorIds(list: PlaceList): string[] {
  return Array.from(
    new Set(
      (list.collaborators || [])
        .filter((c) => c.permission === 'owner' || c.permission === 'editor')
        .map((c) => c.userId)
    )
  );
}

export function getListPermissionUpdates(
  list: PlaceList
): Partial<Pick<PlaceList, 'collaboratorIds' | 'editorIds'>> | null {
  const updates: Partial<Pick<PlaceList, 'collaboratorIds' | 'editorIds'>> = {};
  const expectedIds = getExpectedCollaboratorIds(list);
  const collaboratorIdsMatch =
    list.collaboratorIds &&
    list.collaboratorIds.length === expectedIds.length &&
    expectedIds.every((id) => list.collaboratorIds!.includes(id));
  if (!collaboratorIdsMatch) {
    updates.collaboratorIds = expectedIds;
  }

  const expectedEditorIds = getExpectedEditorIds(list);
  const editorIdsMatch =
    list.editorIds &&
    list.editorIds.length === expectedEditorIds.length &&
    expectedEditorIds.every((id) => list.editorIds!.includes(id));
  if (!editorIdsMatch) {
    updates.editorIds = expectedEditorIds;
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

export function userCanWriteList(list: PlaceList, userId: string): boolean {
  if (list.ownerId === userId) return true;
  return (list.editorIds ?? []).includes(userId);
}

export function assertUserCanWriteList(list: PlaceList, userId: string): void {
  if (userCanWriteList(list, userId)) return;

  const collaborator = list.collaborators?.find((c) => c.userId === userId);
  if (collaborator?.permission === 'editor') {
    throw new Error(
      'You have editor access but this list needs a permission sync. Ask the list owner to open the list once, then try again.'
    );
  }
  throw new Error('You do not have permission to sync places to this list.');
}

/** Reconciles denormalized collaborator/editor ids when the list owner runs sync. */
export async function reconcileListPermissionsIfOwner(
  listId: string,
  list: PlaceList,
  userId: string
): Promise<PlaceList> {
  if (list.ownerId !== userId) {
    return list;
  }

  const updates = getListPermissionUpdates(list);
  if (!updates) {
    return list;
  }

  await updateDoc(doc(db, 'lists', listId), { ...updates, updatedAt: new Date() });
  return { ...list, ...updates };
}
