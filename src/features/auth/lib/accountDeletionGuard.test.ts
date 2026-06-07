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
});
