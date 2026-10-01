/**
 * Time utilities configured for Sri Lanka Standard Time (Asia/Colombo, UTC+05:30)
 */
export const ASIA_COLOMBO = 'Asia/Colombo';
export const COLOMBO_UTC_OFFSET_MINUTES = 330; // +05:30

/**
 * Returns current timestamp formatted in Asia/Colombo time zone
 */
export function formatColomboDateTime(
  dateInput: Date | string | number = new Date(),
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ASIA_COLOMBO,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options,
  }).format(date);
}

/**
 * Returns time only in Asia/Colombo (HH:mm)
 */
export function formatColomboTime(
  dateInput: Date | string | number = new Date()
): string {
  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ASIA_COLOMBO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Returns date only in Asia/Colombo (YYYY-MM-DD)
 */
export function formatColomboDateOnly(
  dateInput: Date | string | number = new Date()
): string {
  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASIA_COLOMBO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Returns hours and minutes in Colombo time
 */
export function getColomboHourAndMinute(
  dateInput: Date | string | number = new Date()
): { hour: number; minute: number } {
  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  const str = new Intl.DateTimeFormat('en-GB', {
    timeZone: ASIA_COLOMBO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const [hour, minute] = str.split(':').map((s) => parseInt(s, 10));
  return { hour, minute };
}

/**
 * Check if the given time falls within standard Sri Lanka business operational hours (08:30 - 17:30 Monday-Friday)
 */
export function isColomboWorkingHours(
  dateInput: Date | string | number = new Date()
): boolean {
  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: ASIA_COLOMBO,
    weekday: 'short',
  }).format(date);

  if (dayName === 'Sat' || dayName === 'Sun') {
    return false;
  }

  const { hour, minute } = getColomboHourAndMinute(date);
  const currentTotal = hour * 60 + minute;
  const start = 8 * 60 + 30; // 08:30
  const end = 17 * 60 + 30;  // 17:30

  return currentTotal >= start && currentTotal <= end;
}

export type ColomboShift = 'morning' | 'evening' | 'night';

/**
 * Categorize operational shift based on Colombo local time:
 * - Morning Shift: 06:00 - 14:00
 * - Evening Shift: 14:00 - 22:00
 * - Night Shift:   22:00 - 06:00
 */
export function getColomboShift(
  dateInput: Date | string | number = new Date()
): ColomboShift {
  const { hour } = getColomboHourAndMinute(dateInput);
  if (hour >= 6 && hour < 14) return 'morning';
  if (hour >= 14 && hour < 22) return 'evening';
  return 'night';
}
