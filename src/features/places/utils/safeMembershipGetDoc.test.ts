import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocMock } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getDoc: getDocMock,
}));

vi.mock('@/utils/syncDebug', () => ({
  syncDebug: vi.fn(),
  syncDebugError: vi.fn(),
}));

import {
  isFirestorePermissionDenied,
  safeGetMembershipDoc,
} from '@/features/places/utils/safeMembershipGetDoc';

const ref = { id: 'list-1_place-1' } as { id: string };

describe('isFirestorePermissionDenied', () => {
  it('detects permission-denied errors', () => {
    expect(isFirestorePermissionDenied({ code: 'permission-denied' })).toBe(true);
    expect(isFirestorePermissionDenied({ code: 'not-found' })).toBe(false);
    expect(isFirestorePermissionDenied(null)).toBe(false);
  });
});

describe('safeGetMembershipDoc', () => {
  beforeEach(() => {
    getDocMock.mockReset();
  });

  it('returns the snapshot when getDoc succeeds', async () => {
    const snap = { exists: () => true, data: () => ({ listId: 'list-1' }) };
    getDocMock.mockResolvedValueOnce(snap);

    await expect(safeGetMembershipDoc(ref as never, 'test-phase')).resolves.toBe(snap);
  });

  it('treats permission-denied as a missing membership doc', async () => {
    getDocMock.mockRejectedValueOnce({ code: 'permission-denied' });

    const snap = await safeGetMembershipDoc(ref as never, 'test-phase');
    expect(snap.exists()).toBe(false);
    expect(snap.data()).toBeUndefined();
  });

  it('rethrows non-permission errors', async () => {
    const error = new Error('network failed');
    getDocMock.mockRejectedValueOnce(error);

    await expect(safeGetMembershipDoc(ref as never, 'test-phase')).rejects.toThrow(
      'network failed'
    );
  });
});
