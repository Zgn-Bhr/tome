// The game layer inside one reading session: per-page dwell and coverage
// (§9.2), counting pages through the engine, and persisting the results.

import type { PageProgress, Stage, TrophyUnlock, XpEvent } from '../../../core/models';
import { CoverageGrid, shouldCount, type PageRect } from '../../../core/gamification/coverage';
import { countPage, isEmpty, ledgerFacts, reachPage, trophyKey, type GameWorld, type Outcome } from '../../../core/gamification/engine';
import { totalXp } from '../../../core/gamification/levels';
import { readingDayKey } from '../../../core/time';
import { recordGame } from '../../actions';
import { api } from '../../api';
import { store } from '../../store';

interface PageTrack {
  dwellMs: number;
  cov: CoverageGrid;
  counted: boolean;
  countedAt?: number;
  /** undefined until the text layer has been read; null for pages without one. */
  words: number | null | undefined;
  dirty: boolean;
}

export interface SessionTotals {
  pages: number;
  xp: XpEvent[];
  trophies: TrophyUnlock[];
  stageClears: Stage[];
  bookCleared: boolean;
  questDone: boolean;
  levelUps: number[];
}

const newId = () => crypto.randomUUID();

export class ReaderGame {
  private pages = new Map<number, PageTrack>();
  private world: GameWorld | null = null;
  readonly totals: SessionTotals = { pages: 0, xp: [], trophies: [], stageClears: [], bookCleared: false, questDone: false, levelUps: [] };
  /** Ledger total and today's counted pages before this session (for the summary). */
  readonly xpBefore: number;
  readonly pagesTodayBefore: number;

  constructor(
    private readonly bookId: string,
    private readonly sessionId: string,
    private readonly onOutcome: (o: Outcome) => void,
  ) {
    const s = store.get();
    this.xpBefore = totalXp(s.xpEvents);
    this.pagesTodayBefore = s.pagesByDay.get(readingDayKey(Date.now())) ?? 0;
  }

  get ready(): boolean {
    return this.world !== null;
  }

  /** Load this book's stored page progress and build the working world. */
  async start(pageCount: number, stages: readonly Stage[]): Promise<void> {
    const rows = await api.pageProgress(this.bookId);
    for (const r of rows) {
      // Merge: the current page may already have a word count or dwell from this session.
      const t = this.track(r.page);
      t.dwellMs += r.dwellMs;
      t.cov.carry(r.viewedFraction);
      t.counted ||= r.counted;
      if (r.countedAt !== undefined) t.countedAt ??= r.countedAt;
    }
    const s = store.get();
    const facts = ledgerFacts(s.xpEvents);
    this.world = {
      xpTotal: totalXp(s.xpEvents),
      pagesByDay: new Map(s.pagesByDay),
      questDays: facts.questDays,
      unlocked: new Set(s.trophies.map((t) => trophyKey(t.trophyId, t.bookId))),
      booksCleared: facts.booksCleared,
      stagesCleared: facts.stagesCleared,
      bestSessionPages: s.bestSessionPages,
      dailyGoal: s.settings.dailyGoal,
      book: {
        id: this.bookId,
        pageCount,
        stages,
        counted: new Set(s.counted[this.bookId] ?? []),
        clearedStages: new Set(facts.clearedStages.get(this.bookId) ?? []),
        cleared: facts.clearedBooks.has(this.bookId),
      },
      sessionId: this.sessionId,
      sessionPages: 0,
    };
  }

  /** Stages can arrive after the reader opened (first-time indexing). */
  setStages(stages: readonly Stage[]): void {
    if (this.world) this.world.book.stages = stages;
  }

  isCounted(page: number): boolean {
    return this.pages.get(page)?.counted ?? false;
  }

  setWords(page: number, words: number | null): void {
    this.track(page).words = words;
  }

  /** Mark the part of `page` currently inside the viewport. */
  markView(page: number, rect: PageRect): void {
    const t = this.track(page);
    if (t.counted) return;
    t.cov.mark(rect);
    t.dirty = true;
  }

  /** Add visible, active time to `page` and count it once it qualifies. */
  tick(page: number, ms: number, now: number): void {
    const t = this.track(page);
    if (t.counted) return;
    t.dwellMs += ms;
    t.dirty = true;
    if (!this.world || t.words === undefined) return;
    if (!shouldCount(t.dwellMs, t.words, t.cov.fraction())) return;
    t.counted = true;
    t.countedAt = now;
    t.dirty = false;
    const o = countPage(this.world, page, t.words, now, newId);
    recordGame({ progress: [this.row(page, t)], xp: o.xp, trophies: o.trophies }, [{ bookId: this.bookId, page, at: now }], this.world.sessionPages);
    this.absorb(o);
  }

  /** The reader is showing `page`: stage and book clears on reaching the end (§9.5). */
  reach(page: number, now: number): void {
    if (!this.world) return;
    const o = reachPage(this.world, page, now, newId);
    if (isEmpty(o)) return;
    recordGame({ progress: [], xp: o.xp, trophies: o.trophies }, [], this.world.sessionPages);
    this.absorb(o);
  }

  /** Persist dwell and coverage for pages touched since the last flush. */
  flush(): void {
    const progress: PageProgress[] = [];
    for (const [page, t] of this.pages) {
      if (!t.dirty) continue;
      t.dirty = false;
      progress.push(this.row(page, t));
    }
    if (progress.length) recordGame({ progress, xp: [], trophies: [] }, [], this.world?.sessionPages ?? 0);
  }

  private absorb(o: Outcome): void {
    this.totals.pages = this.world?.sessionPages ?? this.totals.pages;
    this.totals.xp.push(...o.xp);
    this.totals.trophies.push(...o.trophies);
    this.totals.stageClears.push(...o.stagesCleared);
    if (o.bookCleared) this.totals.bookCleared = true;
    if (o.questDone) this.totals.questDone = true;
    if (o.levelUp) this.totals.levelUps.push(o.levelUp);
    this.onOutcome(o);
  }

  private track(page: number): PageTrack {
    let t = this.pages.get(page);
    if (!t) {
      t = { dwellMs: 0, cov: new CoverageGrid(), counted: false, words: undefined, dirty: false };
      this.pages.set(page, t);
    }
    return t;
  }

  private row(page: number, t: PageTrack): PageProgress {
    return {
      bookId: this.bookId,
      page,
      dwellMs: t.dwellMs,
      viewedFraction: t.cov.fraction(),
      counted: t.counted,
      ...(t.countedAt !== undefined ? { countedAt: t.countedAt } : {}),
    };
  }
}
