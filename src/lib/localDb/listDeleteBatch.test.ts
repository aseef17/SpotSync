import { describe, expect, it } from 'vitest';
import {
  LIST_DELETE_MEMBERSHIP_BATCH_SIZE,
  planListDeleteBatches,
} from '@/lib/localDb/listDeleteBatch';

describe('planListDeleteBatches', () => {
  it('deletes the list in the same batch as the final membership chunk', () => {
    expect(planListDeleteBatches(0)).toEqual([
      { startIndex: 0, endIndex: 0, deleteList: true },
    ]);

    expect(planListDeleteBatches(1)).toEqual([
      { startIndex: 0, endIndex: 1, deleteList: true },
    ]);
  });

  it('chunks large lists so each batch stays within Firestore limits', () => {
    const membershipCount = LIST_DELETE_MEMBERSHIP_BATCH_SIZE + 1;
    const plans = planListDeleteBatches(membershipCount);

    expect(plans).toEqual([
      {
        startIndex: 0,
        endIndex: LIST_DELETE_MEMBERSHIP_BATCH_SIZE,
        deleteList: false,
      },
      {
        startIndex: LIST_DELETE_MEMBERSHIP_BATCH_SIZE,
        endIndex: membershipCount,
        deleteList: true,
      },
    ]);

    for (const plan of plans) {
      const membershipDeletes = plan.endIndex - plan.startIndex;
      const totalOps = membershipDeletes + (plan.deleteList ? 1 : 0);
      expect(totalOps).toBeLessThanOrEqual(500);
    }
  });
});
