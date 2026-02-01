/**
 * Omit specified keys from an object.
 * @param obj The source object
 * @param keys The keys to omit
 * @returns A new object with the specified keys removed
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => {
    delete result[key];
  });
  return result;
}
