const MERIDIEM_PATTERN = /\b(am|pm)\b/i;
const TIME_PATTERN = /(\d{1,2}):(\d{2})\s*(am|pm)?/i;

/**
 * When Google returns "3:00 - 10:00 PM", infer PM on the ambiguous start time.
 * Avoid corrupting standard business hours like "9:00 - 5:00 PM" into "9:00 PM - 5:00 PM".
 */
export function inferAmbiguousStartMeridiem(
  startText: string,
  endText: string
): 'am' | 'pm' | undefined {
  const endMeridiem = endText.match(MERIDIEM_PATTERN)?.[1]?.toLowerCase();
  if (endMeridiem !== 'pm' || MERIDIEM_PATTERN.test(startText)) {
    return undefined;
  }

  const startMinutesAm = parseOpeningHoursTimeToMinutes(startText, { inheritMeridiem: 'am' });
  const startMinutesPm = parseOpeningHoursTimeToMinutes(startText, { inheritMeridiem: 'pm' });
  const endMinutes = parseOpeningHoursTimeToMinutes(endText);
  if (startMinutesAm === null || startMinutesPm === null || endMinutes === null) {
    return undefined;
  }

  const validAmRange = startMinutesAm < endMinutes;
  const validPmRange = startMinutesPm < endMinutes;

  if (validPmRange && !validAmRange) {
    return 'pm';
  }
  if (validAmRange && !validPmRange) {
    return 'am';
  }
  if (validAmRange && validPmRange) {
    const startHour = parseInt(startText.match(/(\d{1,2})/)?.[1] ?? '0', 10);
    return startHour <= 6 ? 'pm' : 'am';
  }

  return undefined;
}

export function normalizeOpeningHoursTimeRange(rangeText: string): string {
  const rangeParts = rangeText.split(/[–—-]/);
  if (rangeParts.length !== 2) {
    return rangeText;
  }

  const start = rangeParts[0].trim();
  const end = rangeParts[1].trim();
  const inferredMeridiem = inferAmbiguousStartMeridiem(start, end);

  if (inferredMeridiem) {
    return `${start} ${inferredMeridiem.toUpperCase()} - ${end}`;
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

export function isOpenAtTimeFromHoursText(
  todayText: string,
  date: Date = new Date()
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

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const rangeParts = todayText.split(/[–—-]/);
  if (rangeParts.length !== 2) {
    return null;
  }

  const startInherit = inferAmbiguousStartMeridiem(rangeParts[0].trim(), rangeParts[1].trim());

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
