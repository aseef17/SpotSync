import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocMock } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: getDocMock,
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

import { isAccountDeletionInProgress } from '@/features/auth/lib/accountDeletionGuard';

describe('isAccountDeletionInProgress', () => {
  beforeEach(() => {
    getDocMock.mockReset();
  });

  it('returns true when the deletion marker exists', async () => {
    getDocMock.mockResolvedValue({ exists: () => true });

    await expect(isAccountDeletionInProgress('user-1')).resolves.toBe(true);
  });

  it('returns false when no deletion marker exists', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });

    await expect(isAccountDeletionInProgress('user-1')).resolves.toBe(false);
  });

  it('fails closed when the marker lookup errors', async () => {
    getDocMock.mockRejectedValue(new Error('offline'));

    await expect(isAccountDeletionInProgress('user-1')).resolves.toBe(true);
  });

  it('treats a completed-deletion tombstone the same as an in-progress marker', async () => {
    // deleteAccount keeps accountDeletions/{uid} after auth is removed so stale ID tokens
    // cannot trigger claimUsernameForUser during the post-deletion token lifetime.
    getDocMock.mockResolvedValue({ exists: () => true });

    await expect(isAccountDeletionInProgress('deleted-user')).resolves.toBe(true);
  });
});
