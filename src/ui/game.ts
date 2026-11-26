// Derived game state for the UI. Everything comes from the ledger and the
// progress tables (§4), never from stored counters.

import { useMemo } from 'react';
import { levelFromTotal, totalXp } from '../core/gamification/levels';
import { streakInfo, weekDots } from '../core/gamification/streak';
import { nextTrophy } from '../core/gamification/trophies';
import { trophyKey } from '../core/gamification/engine';
import { readingDayKey } from '../core/time';
import { useApp, useLedgerFacts } from './store';

export function useGame() {
  const xpEvents = useApp((s) => s.xpEvents);
  const pagesByDay = useApp((s) => s.pagesByDay);
  const trophies = useApp((s) => s.trophies);
  const bestSessionPages = useApp((s) => s.bestSessionPages);
  const intensity = useApp((s) => s.settings.gameIntensity);
  const dailyGoal = useApp((s) => s.settings.dailyGoal);
  const facts = useLedgerFacts();
  return useMemo(() => {
    const today = readingDayKey(Date.now());
    const level = levelFromTotal(totalXp(xpEvents));
    const streak = streakInfo(pagesByDay, today);
    const countedPagesTotal = [...pagesByDay.values()].reduce((a, b) => a + b, 0);
    const unlocked = new Set(trophies.map((t) => trophyKey(t.trophyId, t.bookId)));
    const next = nextTrophy(
      { countedPagesTotal, streak: streak.current, bestStreak: streak.best, booksCleared: facts.booksCleared, stagesCleared: facts.stagesCleared, bestSessionPages },
      unlocked,
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
      unlocked,
    };
  }, [xpEvents, pagesByDay, trophies, bestSessionPages, intensity, dailyGoal, facts]);
}
