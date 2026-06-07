import { describe, expect, it } from 'vitest';

/** Mirrors ImportGoogleMapsModal completion report visibility. */
function shouldShowImportReport(status: {
  success: number;
  failed: number;
  skipped: number;
}): boolean {
  return status.success > 0 || status.skipped > 0 || status.failed > 0;
}

describe('import completion report guard', () => {
  it('hides the success report when import failed before writing any places', () => {
    expect(shouldShowImportReport({ success: 0, failed: 0, skipped: 0 })).toBe(false);
  });

  it('shows the report when at least one place was imported, skipped, or failed', () => {
    expect(shouldShowImportReport({ success: 1, failed: 0, skipped: 0 })).toBe(true);
    expect(shouldShowImportReport({ success: 0, failed: 0, skipped: 3 })).toBe(true);
    expect(shouldShowImportReport({ success: 0, failed: 2, skipped: 0 })).toBe(true);
  });
});
