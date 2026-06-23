/**
 * Stable manual googlePlaceId for NYC Passport imports without a Maps URL.
 * Must match scripts/setup-nyc-passport-list.mjs and scripts/lib/nyc-passport-utils.mjs.
 */
async function sha256HexPrefix(input: string, length = 16): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, length);
}

export async function stablePassportManualId(name: string): Promise<string> {
  const hash = await sha256HexPrefix(name.trim().toLowerCase());
  return `manual_passport_${hash}`;
}
