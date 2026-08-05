/**
 * Utility functions for handling timestamps in Asia/Bangkok (UTC+7) timezone.
 * All timestamps saved to Google Sheets and local stores will be formatted
 * as "YYYY-MM-DD HH:mm:ss" in Bangkok, Hanoi, Jakarta (UTC+7) time.
 */

export function getBangkokTimestamp(dateInput?: Date | string | number): string {
  if (dateInput === null || dateInput === undefined || dateInput === '') {
    dateInput = new Date();
  }

  let d: Date;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) {
      d = new Date();
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      // Already formatted as "YYYY-MM-DD HH:mm:ss"
      return trimmed;
    } else if (trimmed.includes('T') || trimmed.endsWith('Z') || trimmed.includes('+')) {
      // Parse ISO or UTC formatted string
      d = new Date(trimmed);
    } else {
      // Parse standard date string
      d = new Date(trimmed.replace(/-/g, '/'));
    }
  } else if (typeof dateInput === 'number') {
    d = new Date(dateInput);
  } else {
    d = dateInput;
  }

  if (isNaN(d.getTime())) {
    // Return original string if valid fallback or current Bangkok time
    return typeof dateInput === 'string' && dateInput.length > 0 ? dateInput : getBangkokTimestamp(new Date());
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  let hour = getPart('hour');
  if (hour === '24') hour = '00';
  const minute = getPart('minute');
  const second = getPart('second');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Normalizes an arbitrary timestamp string or ISO date into Bangkok UTC+7 format.
 */
export function normalizeToBangkokTime(timestampStr?: string): string {
  if (!timestampStr) return getBangkokTimestamp();
  return getBangkokTimestamp(timestampStr);
}
