// Streak and week dots (spec §9.6).

import { addDays, weekdayIndex } from '../time';
import { GAME } from './config';

/** Counted pages per reading day, keyed by YYYY-MM-DD. */
export type PagesByDay = ReadonlyMap<string, number>;

export interface StreakInfo {
  /** Consecutive qualified days ending today (if qualified) or yesterday. */
  current: number;
  /** Today hasn't qualified yet but the streak is still alive. */
  todayPending: boolean;
  best: number;
}

export function qualifies(pages: number | undefined, min = GAME.streakMinPages): boolean {
  return (pages ?? 0) >= min;
}

export function streakInfo(byDay: PagesByDay, today: string, min = GAME.streakMinPages): StreakInfo {
  const todayOk = qualifies(byDay.get(today), min);
  let current = 0;
  let k = todayOk ? today : addDays(today, -1);
  while (qualifies(byDay.get(k), min)) {
    current++;
    k = addDays(k, -1);
  }
  return { current, todayPending: !todayOk, best: Math.max(current, bestStreak(byDay, min)) };
}

export function bestStreak(byDay: PagesByDay, min = GAME.streakMinPages): number {
  const days = [...byDay.entries()].filter(([, n]) => qualifies(n, min)).map(([k]) => k).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of days) {
    run = prev !== null && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export type WeekDotState = 'qualified' | 'today-pending' | 'future-or-missed';

/** Seven dots Monday→Sunday for the week containing `today`. */
export function weekDots(byDay: PagesByDay, today: string, min = GAME.streakMinPages): WeekDotState[] {
  const monday = addDays(today, -weekdayIndex(today));
  return Array.from({ length: 7 }, (_, i) => {
    const k = addDays(monday, i);
    if (qualifies(byDay.get(k), min)) return 'qualified';
    if (k === today) return 'today-pending';
    return 'future-or-missed';
  });
}
