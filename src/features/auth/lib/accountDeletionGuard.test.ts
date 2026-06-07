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

import {
  isAccountDeletionInProgress,
  resolveProfileUnlessDeletionPending,
} from '@/features/auth/lib/accountDeletionGuard';

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

describe('resolveProfileUnlessDeletionPending', () => {
  beforeEach(() => {
    getDocMock.mockReset();
  });

  it('returns null when a tombstone exists even if a cached profile is present', async () => {
    getDocMock.mockResolvedValue({ exists: () => true });
    const cachedProfile = { id: 'deleted-user', username: 'alice' };

    await expect(
      resolveProfileUnlessDeletionPending('deleted-user', cachedProfile)
    ).resolves.toBeNull();
  });

  it('returns the profile when no tombstone exists', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    const profile = { id: 'user-1', username: 'alice' };

    await expect(resolveProfileUnlessDeletionPending('user-1', profile)).resolves.toBe(profile);
  });

  it('returns null for a null profile without checking the tombstone', async () => {
    await expect(resolveProfileUnlessDeletionPending('user-1', null)).resolves.toBeNull();
    expect(getDocMock).not.toHaveBeenCalled();
  });
});
