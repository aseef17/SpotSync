let listViewPrefetch: Promise<unknown> | null = null;

/** Warm the ListView route chunk so dashboard → list navigation feels instant. */
export function prefetchListView(): void {
  if (!listViewPrefetch) {
    listViewPrefetch = import('@/features/lists/routes/ListView');
  }
}
