import type { Stop, Trip, LoadItem } from './mockData';

export const allItems = (trip: Trip): LoadItem[] => trip.stops.flatMap((s) => s.items);
export const counts = (trip: Trip) => {
  const items = allItems(trip);
  const flagged = items.filter((i) => i.state === 'flagged').length;
  const loaded = items.filter((i) => i.state === 'loaded').length;
  const pending = items.length - flagged - loaded;
  // A flagged item has been reported, so it counts as handled for progress.
  return { total: items.length, loaded, flagged, pending, handled: loaded + flagged };
};
export const stopCounts = (s: Stop) => {
  const done = s.items.filter((i) => i.state !== 'pending').length;
  const loaded = s.items.filter((i) => i.state === 'loaded').length;
  return { loaded, done, total: s.items.length, hasFlag: s.items.some((i) => i.state === 'flagged') };
};
export const tripStatus = (trip: Trip, sealed: boolean): 'ready' | 'loading' | 'not_started' => {
  const c = counts(trip);
  if (sealed || (c.pending === 0 && c.flagged === 0 && c.total > 0)) return 'ready';
  if (c.handled === 0) return 'not_started';
  return 'loading';
};
