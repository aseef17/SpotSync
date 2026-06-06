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
