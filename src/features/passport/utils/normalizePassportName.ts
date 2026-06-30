/** Normalize venue titles for sheet ↔ Firestore matching. */
export function normalizePassportName(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
