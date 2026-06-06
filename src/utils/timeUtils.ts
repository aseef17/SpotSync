export const isOpenNow = (openingHours?: string[]): boolean => {
  if (!openingHours || openingHours.length === 0) return false;

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...

  // Map JS getDay() to typical string prefixes
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayStr = days[dayOfWeek];

  const todayHours = openingHours.find((h) => h.toLowerCase().startsWith(todayStr.toLowerCase()));

  if (!todayHours) return false;

  // e.g. "Monday: 9:00 AM – 5:00 PM" or "Monday: Closed" or "Monday: Open 24 hours"
  const timeStr = todayHours.split(/:\s*/)[1]?.trim();
  if (!timeStr) return false;

  if (timeStr.toLowerCase() === 'closed') return false;
  if (timeStr.toLowerCase().includes('24 hours')) return true;

  // Split multiple intervals, e.g., "9:00 AM – 1:00 PM, 5:00 PM – 10:00 PM"
  const intervals = timeStr.split(',').map((s) => s.trim());

  for (const interval of intervals) {
    // interval e.g. "9:00 AM – 5:00 PM" or "9:00 AM - 5:00 PM" (using en-dash or hyphen)
    const parts = interval.split(/[-–]/).map((s) => s.trim());
    if (parts.length === 2) {
      const openTime = parseTime(parts[0]);
      const closeTime = parseTime(parts[1]);

      if (openTime && closeTime) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        let closeMins = closeTime.minutes;
        // Handle closing past midnight
        if (closeMins < openTime.minutes) {
          closeMins += 24 * 60;
        }

        let currMins = currentMinutes;
        // If it's early morning and we're checking against a past-midnight close time of yesterday
        // Actually, for simplicity, we just check if current time falls in the interval.
        // Wait, if it closes at 2 AM, and it is 1 AM, we should have checked yesterday's hours.
        // For a basic implementation, we just assume if currentMins is < openTime, maybe it's past midnight.
        if (currMins < openTime.minutes && closeMins > 24 * 60) {
          currMins += 24 * 60;
        }

        if (currMins >= openTime.minutes && currMins <= closeMins) {
          return true;
        }
      }
    }
  }

  return false;
};

// Parses "9:00 AM" into minutes since midnight
const parseTime = (timeStr: string): { minutes: number } | null => {
  const match = timeStr.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toUpperCase();

  if (ampm === 'PM' && hours < 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }

  return { minutes: hours * 60 + minutes };
};
