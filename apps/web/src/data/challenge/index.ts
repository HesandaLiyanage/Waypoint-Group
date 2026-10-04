import outletCsv from './outlets.csv?raw';
import vehicleCsv from './vehicles.csv?raw';
import calendarCsv from './calendar.csv?raw';

// These published CSVs contain plain fields without quoted delimiters.
function rows(csv: string): Record<string, string>[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value])));
}
export const challengeOutlets = rows(outletCsv);
export const challengeVehicles = rows(vehicleCsv);
export const challengeCalendar = rows(calendarCsv);
export function nextOperatingDate(after: string): string | undefined {
  return challengeCalendar.find(day => day.date > after && day.is_operating === '1')?.date;
}
