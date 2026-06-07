/** Returns true when a per-place "added" notification should be skipped. */
export function shouldSkipPlaceAddedNotification(
  place: { suppressNotifications?: boolean },
  listData: { importInProgress?: boolean }
): boolean {
  if (place.suppressNotifications) {
    return true;
  }
  if (listData.importInProgress) {
    return true;
  }
  return false;
}
