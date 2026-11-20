// Derived game state for the UI. Everything comes from the ledger and progress
// tables (§4); until M3 writes to them, these show a fresh profile.

import { useMemo } from 'react';
import { levelFromTotal, totalXp } from '../core/gamification/levels';
import { streakInfo, weekDots } from '../core/gamification/streak';
import { nextTrophy } from '../core/gamification/trophies';
import { readingDayKey } from '../core/time';
import { useApp } from './store';

export function useGame() {
  const xpEvents = useApp((s) => s.xpEvents);
  const pagesByDay = useApp((s) => s.pagesByDay);
  const intensity = useApp((s) => s.settings.gameIntensity);
  const dailyGoal = useApp((s) => s.settings.dailyGoal);
  return useMemo(() => {
    const today = readingDayKey(Date.now());
    const level = levelFromTotal(totalXp(xpEvents));
    const streak = streakInfo(pagesByDay, today);
    const countedPagesTotal = [...pagesByDay.values()].reduce((a, b) => a + b, 0);
    const next = nextTrophy(
      { countedPagesTotal, streak: streak.current, bestStreak: streak.best, booksCleared: 0, stagesCleared: 0, bestSessionPages: 0 },
      new Set(),
    );
    return {
      today,
      intensity,
      showXp: intensity === 'full',
      showStreak: intensity !== 'off',
      level,
      streak,
      week: weekDots(pagesByDay, today),
      pagesToday: pagesByDay.get(today) ?? 0,
      dailyGoal,
      next,
    };
  }, [xpEvents, pagesByDay, intensity, dailyGoal]);
}
