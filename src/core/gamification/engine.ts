// The game engine (spec §9): turns counted pages into XP, stage and book
// clears, the daily quest and trophies. Totals are always derived from the
// ledger; this module only decides which new ledger rows to write.

import type { BookId, Stage, TrophyUnlock, XpEvent } from '../models';
import { readingDayKey } from '../time';
import { GAME } from './config';
import { levelFromTotal, pageXp, stageClearXp } from './levels';
import { streakInfo } from './streak';
import { BOOK_TROPHIES, GLOBAL_TROPHIES, type GameSnapshot } from './trophies';

export interface BookGame {
  id: BookId;
  pageCount: number;
  stages: readonly Stage[];
  counted: Set<number>;
  clearedStages: Set<number>;
  cleared: boolean;
}

/** Everything the engine needs, as a mutable working copy for one session. */
export interface GameWorld {
  xpTotal: number;
  pagesByDay: Map<string, number>;
  questDays: Set<string>;
  /** Unlocked trophy keys (see trophyKey). */
  unlocked: Set<string>;
  booksCleared: number;
  stagesCleared: number;
  bestSessionPages: number;
  dailyGoal: number;
  book: BookGame;
  sessionId: string;
  sessionPages: number;
}

export interface Outcome {
  xp: XpEvent[];
  trophies: TrophyUnlock[];
  stagesCleared: Stage[];
  bookCleared: boolean;
  questDone: boolean;
  /** The new level when this outcome crossed one. */
  levelUp: number | null;
}

export const emptyOutcome = (): Outcome => ({ xp: [], trophies: [], stagesCleared: [], bookCleared: false, questDone: false, levelUp: null });

export const trophyKey = (trophyId: string, bookId?: string): string => (bookId ? `${trophyId}:${bookId}` : trophyId);

export function isEmpty(o: Outcome): boolean {
  return !o.xp.length && !o.trophies.length && !o.stagesCleared.length && !o.bookCleared && !o.questDone;
}

type NewId = () => string;

/** A page has just met the dwell and coverage rule (§9.2). */
export function countPage(w: GameWorld, page: number, words: number | null, now: number, newId: NewId): Outcome {
  const o = emptyOutcome();
  if (w.book.counted.has(page) || page < 1 || page > w.book.pageCount) return o;
  const levelBefore = levelFromTotal(w.xpTotal).level;
  w.book.counted.add(page);
  const day = readingDayKey(now);
  w.pagesByDay.set(day, (w.pagesByDay.get(day) ?? 0) + 1);
  w.sessionPages++;
  w.bestSessionPages = Math.max(w.bestSessionPages, w.sessionPages);

  addXp(w, o, pageXp(words), 'page', now, newId, { page });

  if ((w.pagesByDay.get(day) ?? 0) >= w.dailyGoal && !w.questDays.has(day)) {
    w.questDays.add(day);
    o.questDone = true;
    addXp(w, o, GAME.xpDailyQuest, 'daily_quest', now, newId);
  }

  const stage = stageOf(w.book.stages, page);
  if (stage) tryClearStage(w, o, stage, page === stage.endPage, now, newId);
  tryClearBook(w, o, page === w.book.pageCount, now, newId);
  checkTrophies(w, o, now);
  finishLevel(w, o, levelBefore);
  return o;
}

/** The reader is showing `page`: the "reached its last page" rules (§9.5). */
export function reachPage(w: GameWorld, page: number, now: number, newId: NewId): Outcome {
  const o = emptyOutcome();
  const levelBefore = levelFromTotal(w.xpTotal).level;
  const stage = stageOf(w.book.stages, page);
  if (stage && page === stage.endPage) tryClearStage(w, o, stage, true, now, newId);
  tryClearBook(w, o, page === w.book.pageCount, now, newId);
  if (!isEmpty(o)) checkTrophies(w, o, now);
  finishLevel(w, o, levelBefore);
  return o;
}

export function countedInStage(book: BookGame, s: Stage): number {
  let n = 0;
  for (let p = s.startPage; p <= s.endPage; p++) if (book.counted.has(p)) n++;
  return n;
}

function stageOf(stages: readonly Stage[], page: number): Stage | undefined {
  return stages.find((s) => page >= s.startPage && page <= s.endPage);
}

function addXp(w: GameWorld, o: Outcome, amount: number, reason: XpEvent['reason'], now: number, newId: NewId, extra: Partial<XpEvent> = {}): void {
  const e: XpEvent = { id: newId(), at: now, amount, reason, bookId: w.book.id, sessionId: w.sessionId, ...extra };
  o.xp.push(e);
  w.xpTotal += amount;
}

function tryClearStage(w: GameWorld, o: Outcome, s: Stage, reachedEnd: boolean, now: number, newId: NewId): void {
  if (w.book.clearedStages.has(s.index)) return;
  const len = s.endPage - s.startPage + 1;
  const frac = countedInStage(w.book, s) / len;
  if (frac < GAME.stageClearFraction && !(reachedEnd && frac >= GAME.stageClearAtEndFraction)) return;
  w.book.clearedStages.add(s.index);
  w.stagesCleared++;
  o.stagesCleared.push(s);
  addXp(w, o, stageClearXp(len), 'stage_clear', now, newId, { stageIndex: s.index });
}

function tryClearBook(w: GameWorld, o: Outcome, reachedLast: boolean, now: number, newId: NewId): void {
  const b = w.book;
  if (b.cleared || b.pageCount < 1) return;
  const allStages = b.stages.length > 0 && b.stages.every((s) => b.clearedStages.has(s.index));
  const frac = b.counted.size / b.pageCount;
  if (!allStages && !(reachedLast && frac >= GAME.bookClearAtEndFraction)) return;
  b.cleared = true;
  w.booksCleared++;
  o.bookCleared = true;
  addXp(w, o, GAME.xpBookClear, 'book_clear', now, newId);
}

function checkTrophies(w: GameWorld, o: Outcome, now: number): void {
  const streak = streakInfo(w.pagesByDay, readingDayKey(now));
  const snap: GameSnapshot = {
    countedPagesTotal: [...w.pagesByDay.values()].reduce((a, b) => a + b, 0),
    streak: streak.current,
    bestStreak: streak.best,
    booksCleared: w.booksCleared,
    stagesCleared: w.stagesCleared,
    bestSessionPages: w.bestSessionPages,
  };
  for (const t of GLOBAL_TROPHIES) {
    const key = trophyKey(t.id);
    if (w.unlocked.has(key)) continue;
    const p = t.progress(snap);
    if (p.current >= p.target) {
      w.unlocked.add(key);
      o.trophies.push({ trophyId: t.id, at: now });
    }
  }
  const b = w.book;
  const bookSnap = { pageCount: b.pageCount, countedPages: b.counted.size, stageCount: b.stages.length, firstStageCleared: b.clearedStages.has(0), cleared: b.cleared };
  for (const t of BOOK_TROPHIES) {
    const key = trophyKey(t.id, b.id);
    if (w.unlocked.has(key)) continue;
    const p = t.progress(bookSnap);
    if (p.current >= p.target) {
      w.unlocked.add(key);
      o.trophies.push({ trophyId: t.id, bookId: b.id, at: now });
    }
  }
}

function finishLevel(w: GameWorld, o: Outcome, before: number): void {
  const after = levelFromTotal(w.xpTotal).level;
  if (after > before) o.levelUp = after;
}

/** Facts derived from the XP ledger: which stages and books are cleared, quest days. */
export interface LedgerFacts {
  clearedStages: Map<BookId, Set<number>>;
  clearedBooks: Set<BookId>;
  questDays: Set<string>;
  stagesCleared: number;
  booksCleared: number;
}

export function ledgerFacts(xp: readonly XpEvent[]): LedgerFacts {
  const f: LedgerFacts = { clearedStages: new Map(), clearedBooks: new Set(), questDays: new Set(), stagesCleared: 0, booksCleared: 0 };
  for (const e of xp) {
    if (e.reason === 'stage_clear' && e.bookId !== undefined && e.stageIndex !== undefined) {
      let set = f.clearedStages.get(e.bookId);
      if (!set) f.clearedStages.set(e.bookId, (set = new Set()));
      if (!set.has(e.stageIndex)) {
        set.add(e.stageIndex);
        f.stagesCleared++;
      }
    } else if (e.reason === 'book_clear' && e.bookId !== undefined && !f.clearedBooks.has(e.bookId)) {
      f.clearedBooks.add(e.bookId);
      f.booksCleared++;
    } else if (e.reason === 'daily_quest') {
      f.questDays.add(readingDayKey(e.at));
    }
  }
  return f;
}
