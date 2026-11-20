// Levels (spec §9.4): xpToNext(L) = 600 + 100 × L, starting at level 1.

import type { XpEvent } from '../models';
import { GAME } from './config';

export function xpToNext(level: number): number {
  return 600 + 100 * level;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  intoLevel: number;
  /** XP needed to go from this level to the next. */
  needed: number;
  total: number;
}

export function levelFromTotal(totalXp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, intoLevel: rest, needed: xpToNext(level), total: Math.max(0, Math.floor(totalXp)) };
}

export function totalXp(events: readonly XpEvent[]): number {
  return events.reduce((sum, e) => sum + e.amount, 0);
}

/** XP for one counted page (§9.3, word-weighted). */
export function pageXp(words: number | null): number {
  if (words === null) return GAME.xpNoTextPage;
  const raw = Math.round(words / GAME.xpWordsPerPoint);
  return Math.min(GAME.xpPerPageMax, Math.max(GAME.xpPerPageMin, raw));
}

/** XP for clearing a stage of `pages` pages. */
export function stageClearXp(pages: number): number {
  return pages >= GAME.xpStageClearMinPages ? GAME.xpStageClearBig : Math.max(20, 10 * pages);
}

/** Seconds a page must be visible before it can count (§9.2). */
export function dwellThresholdSec(words: number | null): number {
  if (words === null) return GAME.dwellNoTextSec;
  return Math.min(GAME.dwellMaxSec, Math.max(GAME.dwellMinSec, GAME.dwellSecPerWord * words));
}
