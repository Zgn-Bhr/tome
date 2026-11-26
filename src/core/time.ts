// Reading-day boundary and duration formatting (spec §9.6).

/** A reading day starts at 04:00 local time. */
export const DAY_START_HOUR = 4;

/**
 * Day key (YYYY-MM-DD) for the reading day containing `epochMs`, computed from
 * local wall-clock time so DST shifts never produce a skipped or doubled day.
 */
export function readingDayKey(epochMs: number, dayStartHour = DAY_START_HOUR): string {
  const d = new Date(epochMs);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return localDateKey(d);
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD key by whole calendar days (DST-safe: works at noon). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/** Monday-first weekday index 0..6 for a day key. */
export function weekdayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const js = new Date(y, m - 1, d, 12).getDay(); // 0 = Sunday
  return (js + 6) % 7;
}

/** "4 h 12 m", "26m", "45s" style durations. */
export function formatDuration(ms: number, style: 'long' | 'short' = 'long'): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (ms > 0 && totalMin === 0) return style === 'short' ? '<1m' : '<1 m';
  if (style === 'short') {
    if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
    return `${m}m`;
  }
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

/** "mm:ss", or "h:mm:ss" past an hour. */
export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Whole calendar days from key `a` to key `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** "today", "yesterday", "3 days ago" relative to now, by reading day. */
export function relativeDay(epochMs: number, now: number): string {
  const n = daysBetween(readingDayKey(epochMs), readingDayKey(now));
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

/** Compact "since" value for stat cells: "3d", "5h", "12m", "now". */
export function compactSince(epochMs: number, now: number): string {
  const diff = Math.max(0, now - epochMs);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
