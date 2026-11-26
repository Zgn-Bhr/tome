import { describe, expect, it } from 'vitest';
import type { Stage } from '../models';
import { CoverageGrid, shouldCount } from './coverage';
import { countPage, ledgerFacts, reachPage, trophyKey, type GameWorld } from './engine';

const NOW = new Date(2026, 10, 20, 12, 0).getTime(); // a Friday, midday
let n = 0;
const id = () => `e${++n}`;

function stages(bounds: [number, number][]): Stage[] {
  return bounds.map(([s, e], i) => ({ bookId: 'b', index: i, label: `S${i}`, startPage: s, endPage: e, isFinal: i === bounds.length - 1 }));
}

function world(over: Partial<GameWorld> = {}, pageCount = 40, st = stages([[1, 10], [11, 30], [31, 40]])): GameWorld {
  return {
    xpTotal: 0,
    pagesByDay: new Map(),
    questDays: new Set(),
    unlocked: new Set(),
    booksCleared: 0,
    stagesCleared: 0,
    bestSessionPages: 0,
    dailyGoal: 25,
    book: { id: 'b', pageCount, stages: st, counted: new Set(), clearedStages: new Set(), cleared: false },
    sessionId: 's',
    sessionPages: 0,
    ...over,
  };
}

describe('coverage', () => {
  it('marks cells inside the viewport and reports the fraction', () => {
    const g = new CoverageGrid();
    g.mark({ x0: 0, y0: 0, x1: 1, y1: 0.5 });
    expect(g.fraction()).toBeCloseTo(0.5);
    g.mark({ x0: 0, y0: 0.4, x1: 1, y1: 1 });
    expect(g.fraction()).toBe(1);
  });

  it('keeps coverage carried over from an earlier session', () => {
    expect(new CoverageGrid(0.8).fraction()).toBe(0.8);
  });

  it('needs both dwell and coverage', () => {
    expect(shouldCount(30_000, 300, 0.69)).toBe(false);
    expect(shouldCount(21_000, 300, 0.7)).toBe(false); // T = 21.6 s for 300 words
    expect(shouldCount(22_000, 300, 0.7)).toBe(true);
    expect(shouldCount(15_000, null, 1)).toBe(true);
  });
});

describe('game engine', () => {
  it('awards word-weighted XP once per page', () => {
    const w = world();
    expect(countPage(w, 1, 300, NOW, id).xp.map((e) => [e.reason, e.amount])).toEqual([['page', 5]]);
    expect(countPage(w, 1, 300, NOW, id).xp).toHaveLength(0);
    expect(w.sessionPages).toBe(1);
    expect(w.pagesByDay.get('2026-11-20')).toBe(1);
  });

  it('unlocks First Page on the first counted page', () => {
    const w = world();
    expect(countPage(w, 1, 300, NOW, id).trophies.map((t) => t.trophyId)).toEqual(['first_page']);
    expect(w.unlocked.has(trophyKey('first_page'))).toBe(true);
  });

  it('clears a stage at 90 % counted', () => {
    const w = world();
    for (let p = 1; p <= 8; p++) expect(countPage(w, p, 300, NOW, id).stagesCleared).toHaveLength(0);
    const o = countPage(w, 9, 300, NOW, id);
    expect(o.stagesCleared.map((s) => s.index)).toEqual([0]);
    expect(o.xp.find((e) => e.reason === 'stage_clear')).toMatchObject({ amount: 100, stageIndex: 0 });
    expect(o.trophies.map((t) => t.trophyId)).toContain('first_steps');
  });

  it('clears a stage on reaching its last page with 70 % counted', () => {
    const w = world();
    for (let p = 1; p <= 7; p++) countPage(w, p, 300, NOW, id);
    expect(reachPage(w, 9, NOW, id).stagesCleared).toHaveLength(0); // not the last page
    expect(reachPage(w, 10, NOW, id).stagesCleared.map((s) => s.index)).toEqual([0]);
  });

  it('never clears a stage that was jumped over', () => {
    const w = world();
    expect(reachPage(w, 10, NOW, id).stagesCleared).toHaveLength(0);
    expect(w.book.clearedStages.size).toBe(0);
  });

  it('completes the daily quest once per reading day', () => {
    const w = world({ dailyGoal: 3 }, 100, stages([[1, 100]]));
    countPage(w, 1, 300, NOW, id);
    countPage(w, 2, 300, NOW, id);
    const o = countPage(w, 3, 300, NOW, id);
    expect(o.questDone).toBe(true);
    expect(o.xp.find((e) => e.reason === 'daily_quest')?.amount).toBe(50);
    expect(countPage(w, 4, 300, NOW, id).questDone).toBe(false);
  });

  it('clears the book when every stage is cleared', () => {
    const w = world({}, 10, stages([[1, 5], [6, 10]]));
    let last;
    for (let p = 1; p <= 10; p++) last = countPage(w, p, 300, NOW, id);
    expect(last!.bookCleared).toBe(true);
    expect(last!.trophies.map((t) => t.trophyId)).toEqual(expect.arrayContaining(['cover_to_cover', 'bookworm_1']));
    expect(w.booksCleared).toBe(1);
  });

  it('clears the book on the last page with 80 % counted', () => {
    const w = world({}, 10, stages([[1, 10]]));
    for (let p = 1; p <= 8; p++) countPage(w, p, 300, NOW, id);
    expect(w.book.cleared).toBe(false); // 80 % but not on the last page, stage needs 90 %
    const o = reachPage(w, 10, NOW, id);
    expect(o.bookCleared).toBe(true);
  });

  it('reports level ups', () => {
    const w = world({ xpTotal: 698 });
    expect(countPage(w, 1, 300, NOW, id).levelUp).toBe(2);
  });

  it('unlocks Marathon at 50 pages in one session', () => {
    const w = world({ unlocked: new Set(['first_page']) }, 100, stages([[1, 100]]));
    const ids = [];
    for (let p = 1; p <= 50; p++) ids.push(...countPage(w, p, 300, NOW, id).trophies.map((t) => t.trophyId));
    expect(ids).toContain('marathon');
  });

  it('derives cleared stages, books and quest days from the ledger', () => {
    const f = ledgerFacts([
      { id: '1', at: NOW, amount: 100, reason: 'stage_clear', bookId: 'b', stageIndex: 0 },
      { id: '2', at: NOW, amount: 100, reason: 'stage_clear', bookId: 'b', stageIndex: 0 },
      { id: '3', at: NOW, amount: 500, reason: 'book_clear', bookId: 'b' },
      { id: '4', at: NOW, amount: 50, reason: 'daily_quest' },
    ]);
    expect([...f.clearedStages.get('b')!]).toEqual([0]);
    expect(f.stagesCleared).toBe(1);
    expect(f.clearedBooks.has('b')).toBe(true);
    expect(f.questDays.has('2026-11-20')).toBe(true);
  });
});
