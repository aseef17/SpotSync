/** Returns whether cached list/places data may be applied to UI state. */
export function canApplyCachedListData(opts: {
  cancelled: boolean;
  listAccessible: boolean;
}): boolean {
  return !opts.cancelled && opts.listAccessible;
}
