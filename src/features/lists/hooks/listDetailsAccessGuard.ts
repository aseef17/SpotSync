import type { PlaceList } from '@/features/lists/types/list';

/** Clear cached list-detail UI when a list disappears from the user's lists context. */
export function shouldClearStaleListContextView(
  hadListFromContext: boolean,
  listFromContext: PlaceList | undefined,
  listId: string | undefined
): boolean {
  return Boolean(listId && hadListFromContext && !listFromContext);
}
