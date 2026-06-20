/**
 * Safely deep-clones an object and omits the specified keys.
 * Use this instead of object destructuring to avoid unused variable lint errors.
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[] | K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/** Removes keys whose values are `undefined` (Firestore rejects undefined field values). */
export function omitUndefined<T extends object>(obj: T): Partial<T> {
  const result = {} as Partial<T>;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
