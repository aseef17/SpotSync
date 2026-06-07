export interface ListContextSnapshot {
  listId?: string;
  hadContext: boolean;
}

export function listDroppedFromContext(
  listId: string | undefined,
  previous: ListContextSnapshot,
  hasListInContext: boolean
): boolean {
  return (
    !!listId && previous.listId === listId && previous.hadContext && !hasListInContext
  );
}
