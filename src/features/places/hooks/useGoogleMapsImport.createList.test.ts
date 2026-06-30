import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const hookSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'useGoogleMapsImport.ts'),
  'utf8'
);

describe('useGoogleMapsImport createList call', () => {
  it('passes cardIcon and cardColor before isPublic', () => {
    const match = hookSource.match(
      /ListService\.createList\([\s\S]*?\);/
    );
    expect(match).not.toBeNull();

    const call = match![0];
    const cardIconIndex = call.indexOf('DEFAULT_LIST_CARD_ICON');
    const cardColorIndex = call.indexOf('DEFAULT_LIST_CARD_COLOR');
    const isPublicIndex = call.indexOf('false');

    expect(cardIconIndex).toBeGreaterThan(-1);
    expect(cardColorIndex).toBeGreaterThan(cardIconIndex);
    expect(isPublicIndex).toBeGreaterThan(cardColorIndex);
  });
});
