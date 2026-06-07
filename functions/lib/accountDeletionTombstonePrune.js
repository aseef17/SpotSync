/**
 * Decide whether an accountDeletions tombstone is safe to remove.
 *
 * Completed markers (completedAt) are pruned after retention. Legacy markers that
 * only have startedAt are pruned only when the Auth user no longer exists, so a
 * failed deleteAccount run cannot lose its tombstone while the user is still signed in.
 */
function shouldPruneAccountDeletionTombstone(data, cutoffMs, authUserDeleted) {
  const completedAt = data.completedAt;
  const startedAt = data.startedAt;

  if (completedAt?.toMillis() <= cutoffMs) {
    return true;
  }

  if (!completedAt && startedAt?.toMillis() <= cutoffMs) {
    return authUserDeleted;
  }

  return false;
}

module.exports = {
  shouldPruneAccountDeletionTombstone,
};
