import { describe, expect, it } from 'vitest';
import { isIncomingCacheUpdateNewer } from '@/lib/localDb/cacheFreshness';

describe('isIncomingCacheUpdateNewer', () => {
  it('accepts updates when no cached record exists', () => {
    expect(isIncomingCacheUpdateNewer(null, { updatedAt: new Date('2024-01-01') })).toBe(true);
  });

  it('rejects stale inbound snapshots', () => {
    const existing = { updatedAt: new Date('2024-01-02T12:00:00Z') };
    const incoming = { updatedAt: new Date('2024-01-02T11:00:00Z') };

    expect(isIncomingCacheUpdateNewer(existing, incoming)).toBe(false);
  });

  it('accepts newer inbound snapshots', () => {
    const existing = { updatedAt: new Date('2024-01-02T11:00:00Z') };
    const incoming = { updatedAt: new Date('2024-01-02T12:00:00Z') };

    expect(isIncomingCacheUpdateNewer(existing, incoming)).toBe(true);
  });

  it('accepts equal timestamps', () => {
    const timestamp = new Date('2024-01-02T12:00:00Z');
    expect(isIncomingCacheUpdateNewer({ updatedAt: timestamp }, { updatedAt: timestamp })).toBe(
      true
    );
  });
});
