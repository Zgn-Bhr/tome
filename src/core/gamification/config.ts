// Game-layer constants (spec §9). Kept together so they are easy to tune.

export const GAME = {
  /** Dwell seconds per word: T = clamp(0.072 × words, 4, 45). */
  dwellSecPerWord: 0.072,
  dwellMinSec: 4,
  dwellMaxSec: 45,
  dwellNoTextSec: 15,
  idleCapMs: 5 * 60_000,
  coverageToCount: 0.7,
  xpPerPageMin: 2,
  xpPerPageMax: 12,
  xpWordsPerPoint: 60,
  xpNoTextPage: 5,
  xpStageClearBig: 100,
  xpStageClearMinPages: 10,
  xpDailyQuest: 50,
  xpBookClear: 500,
  dailyGoalDefault: 25,
  streakMinPages: 5,
  stageClearFraction: 0.9,
  stageClearAtEndFraction: 0.7,
  bookClearAtEndFraction: 0.8,
} as const;
