const DATE_MARKER = '__spotsyncDate';

export function serializeRecord<T>(value: T): string {
  return JSON.stringify(value, (_, entry) => {
    if (entry instanceof Date) {
      return { [DATE_MARKER]: entry.toISOString() };
    }
    return entry;
  });
}

export function deserializeRecord<T>(json: string): T {
  return JSON.parse(json, (_, entry) => {
    if (entry && typeof entry === 'object' && DATE_MARKER in entry) {
      const iso = entry[DATE_MARKER];
      return typeof iso === 'string' ? new Date(iso) : entry;
    }
    return entry;
  }) as T;
}
