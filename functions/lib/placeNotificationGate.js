/** Returns true when a per-place "added" notification should be skipped. */
function shouldSkipPlaceAddedNotification(place, listData) {
  if (place?.suppressNotifications) {
    return true;
  }
  if (listData?.importInProgress) {
    return true;
  }
  return false;
}

module.exports = { shouldSkipPlaceAddedNotification };
