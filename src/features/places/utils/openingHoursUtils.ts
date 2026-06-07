import { getZonedMinutesFromMidnight } from '@/features/places/utils/placeTimeUtils';

const MERIDIEM_PATTERN = /\b(am|pm)\b/i;
const TIME_PATTERN = /(\d{1,2}):(\d{2})\s*(am|pm)?/i;

function parseHourFromTimeFragment(fragment: string): number | null {
  const match = fragment.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

/** Infer PM on ambiguous starts like "3:00 - 10:00 PM", not lunch ranges like "11:00 - 2:00 PM". */
function shouldInferPmOnAmbiguousStart(start: string, end: string): boolean {
  const endMeridiem = end.match(MERIDIEM_PATTERN)?.[1]?.toLowerCase();
  const startHasMeridiem = MERIDIEM_PATTERN.test(start);

  if (startHasMeridiem || endMeridiem !== 'pm') {
    return false;
  }

  const startHour = parseHourFromTimeFragment(start);
  const endHour = parseHourFromTimeFragment(end);

  if (startHour === null || endHour === null) {
    return false;
  }

  return startHour < endHour;
}

export function normalizeOpeningHoursTimeRange(rangeText: string): string {
  const rangeParts = rangeText.split(/[–—-]/);
  if (rangeParts.length !== 2) {
    return rangeText;
  }

  const start = rangeParts[0].trim();
  const end = rangeParts[1].trim();
  if (shouldInferPmOnAmbiguousStart(start, end)) {
    return `${start} PM - ${end}`;
  }

  return rangeText;
}

export function normalizeOpeningHoursLine(line: string): string {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) {
    return line;
  }

  const dayPrefix = line.slice(0, colonIdx + 1);
  const hoursPart = line.slice(colonIdx + 1).trim();
  const hoursLower = hoursPart.toLowerCase();

  if (hoursLower === 'closed' || hoursLower.includes('open 24 hours')) {
    return line;
  }

  const normalized = hoursPart
    .split(',')
    .map((part) => normalizeOpeningHoursTimeRange(part.trim()))
    .join(', ');

  return `${dayPrefix} ${normalized}`;
}

export function normalizeOpeningHours(hours: string[] | undefined | null): string[] | undefined {
  if (!hours || hours.length === 0) {
    return undefined;
  }
  return hours.map(normalizeOpeningHoursLine);
}

export function parseOpeningHoursTimeToMinutes(
  timeStr: string,
  options?: { inheritMeridiem?: 'am' | 'pm' }
): number | null {
  const match = timeStr.match(TIME_PATTERN);
  if (!match) {
    return null;
  }

  const [, hStr, mStr, meridiemStr] = match;
  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  let meridiem = meridiemStr?.toLowerCase();

  if (!meridiem && options?.inheritMeridiem) {
    meridiem = options.inheritMeridiem;
  }

  if (meridiem) {
    if (meridiem === 'pm' && hours < 12) {
      hours += 12;
    }
    if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }
  }

  return hours * 60 + minutes;
}

function splitHoursRangeSegments(todayText: string): string[] {
  return todayText
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isOpenInSingleRange(rangeText: string, currentMinutes: number): boolean | null {
  const rangeParts = rangeText.split(/[–—-]/);
  if (rangeParts.length !== 2) {
    return null;
  }

  const startInherit = shouldInferPmOnAmbiguousStart(rangeParts[0].trim(), rangeParts[1].trim())
    ? ('pm' as const)
    : undefined;
  const startMinutes = parseOpeningHoursTimeToMinutes(rangeParts[0].trim(), {
    inheritMeridiem: startInherit,
  });
  const endMinutes = parseOpeningHoursTimeToMinutes(rangeParts[1].trim());

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  if (endMinutes < startMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function isOpenAtTimeFromHoursText(
  todayText: string,
  date: Date = new Date(),
  options?: { timeZone?: string; currentMinutes?: number }
): boolean | null {
  const textLower = todayText.toLowerCase();

  if (textLower.includes('closed')) {
    return false;
  }
  if (textLower.includes('open 24 hours')) {
    return true;
  }
  if (!todayText.match(/\d+:\d+/)) {
    return null;
  }

  const currentMinutes =
    options?.currentMinutes ??
    (options?.timeZone
      ? getZonedMinutesFromMidnight(options.timeZone, date)
      : date.getHours() * 60 + date.getMinutes());

  const segments = splitHoursRangeSegments(todayText);
  let parsedAnyRange = false;

  for (const segment of segments) {
    const result = isOpenInSingleRange(segment, currentMinutes);
    if (result === null) {
      continue;
    }
    parsedAnyRange = true;
    if (result) {
      return true;
    }
  }

  return parsedAnyRange ? false : null;
}
