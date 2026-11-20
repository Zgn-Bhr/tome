import { describe, expect, it } from 'vitest';
import { addDays, readingDayKey } from '../time';
import { dwellThresholdSec, levelFromTotal, pageXp, stageClearXp, xpToNext } from './levels';
import { bestStreak, streakInfo, weekDots } from './streak';

describe('levels', () => {
  it('uses xpToNext(L) = 600 + 100L', () => {
    expect(xpToNext(1)).toBe(700);
    expect(xpToNext(14)).toBe(2000); // fixture: level 14 needs 2,000
  });

  it('derives level from total XP', () => {
    expect(levelFromTotal(0)).toMatchObject({ level: 1, intoLevel: 0, needed: 700 });
    expect(levelFromTotal(700)).toMatchObject({ level: 2, intoLevel: 0 });
    // Sum of xpToNext(1..13) = 13*600 + 100*(91) = 16,900; +1,240 → level 14 at 1,240/2,000.
    expect(levelFromTotal(16_900 + 1_240)).toMatchObject({ level: 14, intoLevel: 1240, needed: 2000 });
  });
});

describe('XP formulas', () => {
  it('weights pages by words, clamped 2..12', () => {
    expect(pageXp(30)).toBe(2);
    expect(pageXp(300)).toBe(5);
    expect(pageXp(2000)).toBe(12);
    expect(pageXp(null)).toBe(5);
  });

  it('awards stage clears', () => {
    expect(stageClearXp(48)).toBe(100);
    expect(stageClearXp(4)).toBe(40);
    expect(stageClearXp(1)).toBe(20);
  });

  it('computes dwell thresholds', () => {
    expect(dwellThresholdSec(10)).toBe(4);
    expect(dwellThresholdSec(300)).toBeCloseTo(21.6);
    expect(dwellThresholdSec(5000)).toBe(45);
    expect(dwellThresholdSec(null)).toBe(15);
  });
});

describe('reading day', () => {
  it('starts at 04:00 local time', () => {
    const lateNight = new Date(2026, 10, 20, 2, 30).getTime(); // 02:30 on the 20th
    const morning = new Date(2026, 10, 20, 4, 0).getTime();
    expect(readingDayKey(lateNight)).toBe('2026-11-19');
    expect(readingDayKey(morning)).toBe('2026-11-20');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('streak', () => {
  const days = (entries: [string, number][]) => new Map(entries);

  it('counts consecutive qualified days, with today pending', () => {
    const m = days([
      ['2026-11-16', 9],
      ['2026-11-17', 5],
      ['2026-11-18', 12],
      ['2026-11-19', 30],
      ['2026-11-20', 2],
    ]);
    expect(streakInfo(m, '2026-11-20')).toEqual({ current: 4, todayPending: true, best: 4 });
  });

  it('resets after a missed day', () => {
    const m = days([
      ['2026-11-17', 9],
      ['2026-11-19', 9],
    ]);
    expect(streakInfo(m, '2026-11-20').current).toBe(1);
    expect(streakInfo(m, '2026-11-21').current).toBe(0);
  });

  it('includes today once it qualifies and tracks the best run', () => {
    const m = days([
      ['2026-10-01', 5],
      ['2026-10-02', 5],
      ['2026-10-03', 5],
      ['2026-11-20', 7],
    ]);
    expect(streakInfo(m, '2026-11-20')).toEqual({ current: 1, todayPending: false, best: 3 });
    expect(bestStreak(m)).toBe(3);
  });

  it('draws week dots Monday to Sunday', () => {
    // 2026-11-20 is a Friday.
    const m = days([
      ['2026-11-16', 9],
      ['2026-11-17', 9],
      ['2026-11-18', 9],
      ['2026-11-19', 9],
    ]);
    expect(weekDots(m, '2026-11-20')).toEqual([
      'qualified',
      'qualified',
      'qualified',
      'qualified',
      'today-pending',
      'future-or-missed',
      'future-or-missed',
    ]);
  });
});
