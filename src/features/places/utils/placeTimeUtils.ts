import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Current weekday name in the place's IANA timezone (e.g. America/New_York). */
export function getZonedWeekdayName(timeZone: string, date: Date = new Date()): string {
  return WEEKDAY_NAMES[dayjs(date).tz(timeZone).day()];
}

/** Minutes from local midnight in the place timezone. */
export function getZonedMinutesFromMidnight(timeZone: string, date: Date = new Date()): number {
  const zoned = dayjs(date).tz(timeZone);
  return zoned.hour() * 60 + zoned.minute();
}
