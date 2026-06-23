import { describe, expect, it } from 'vitest';
import { stablePassportManualId } from '@/features/places/utils/stablePassportManualId';

describe('stablePassportManualId', () => {
  it('matches the NYC passport import script hash for MoMA PS1', async () => {
    await expect(stablePassportManualId('MoMA PS1')).resolves.toBe(
      'manual_passport_0f6e093656b1354e'
    );
  });
});
