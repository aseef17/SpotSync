import { Timestamp } from 'firebase/firestore';

/**
 * Safely converts Firestore Timestamp, Date object, or string/number to milliseconds.
 */
export function toMilliseconds(date: unknown): number {
  if (!date) return 0;
  
  if (
    typeof date === 'object' &&
    date !== null &&
    'toMillis' in date &&
    typeof (date as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (date as { toMillis: () => number }).toMillis();
  }
  
  if (date instanceof Timestamp) {
    return date.toMillis();
  }

  if (date instanceof Date) {
    return date.getTime();
  }

  if (typeof date === 'string' || typeof date === 'number') {
    const parsedDate = new Date(date);
    const time = parsedDate.getTime();
    return isNaN(time) ? 0 : time;
  }
  
  return 0;
}

/**
 * Safely converts any date-like value to a Date object.
 */
export function toDate(date: unknown): Date {
  if (date instanceof Date) return date;
  if (date instanceof Timestamp) return date.toDate();
  if (typeof date === 'string' || typeof date === 'number') return new Date(date);
  return new Date(0);
}
