/** Firestore batch writes are capped at 500 operations; reserve one slot for the list doc. */
export const LIST_DELETE_MEMBERSHIP_BATCH_SIZE = 499;

export interface ListDeleteBatchPlan {
  startIndex: number;
  endIndex: number;
  deleteList: boolean;
}

/** Plans chunked membership deletes so each Firestore batch stays under the 500-op limit. */
export function planListDeleteBatches(membershipCount: number): ListDeleteBatchPlan[] {
  if (membershipCount === 0) {
    return [{ startIndex: 0, endIndex: 0, deleteList: true }];
  }

  const plans: ListDeleteBatchPlan[] = [];
  for (let i = 0; i < membershipCount; i += LIST_DELETE_MEMBERSHIP_BATCH_SIZE) {
    const endIndex = Math.min(i + LIST_DELETE_MEMBERSHIP_BATCH_SIZE, membershipCount);
    plans.push({
      startIndex: i,
      endIndex,
      deleteList: endIndex >= membershipCount,
    });
  }

  return plans;
}
