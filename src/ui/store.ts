// A small external store for app data, read with useSyncExternalStore.

import { useMemo, useSyncExternalStore } from 'react';
import type { Book, BookStats, Bookmark, Collection, ReadingState, Settings, Stage, TrophyUnlock, XpEvent } from '../core/models';
import { DEFAULT_SETTINGS } from '../core/settings';
import { progressOf, type BookView } from '../core/library';
import { ledgerFacts, type LedgerFacts } from '../core/gamification/engine';
import type { AppEnv } from '../shared/api';

export interface AppState {
  ready: boolean;
  env: AppEnv | null;
  settings: Settings;
  firstRun: boolean;
  books: Record<string, Book>;
  stages: Record<string, Stage[]>;
  states: Record<string, ReadingState>;
  bookmarks: Record<string, Bookmark[]>;
  stats: Record<string, BookStats>;
  xpEvents: XpEvent[];
  pagesByDay: Map<string, number>;
  /** Counted pages per book (§9.2). */
  counted: Record<string, ReadonlySet<number>>;
  trophies: TrophyUnlock[];
  bestSessionPages: number;
  /** User collections in creation order (smart ones are derived). */
  collections: Collection[];
  scanning: boolean;
  indexing: { done: number; total: number } | null;
  /** The reader is open: background indexing pauses (§12 battery). */
  reading: boolean;
}

let state: AppState = {
  ready: false,
  env: null,
  settings: DEFAULT_SETTINGS,
  firstRun: false,
  books: {},
  stages: {},
  states: {},
  bookmarks: {},
  stats: {},
  xpEvents: [],
  pagesByDay: new Map(),
  counted: {},
  trophies: [],
  bestSessionPages: 0,
  collections: [],
  scanning: false,
  indexing: null,
  reading: false,
};

const listeners = new Set<() => void>();

export const store = {
  get: (): AppState => state,
  set(fn: (s: AppState) => Partial<AppState>): void {
    state = { ...state, ...fn(state) };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Select a slice. Selectors must return stored references, not new objects. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

export function groupBy<T, K extends string>(items: readonly T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) (out[key(it)] ??= []).push(it);
  return out;
}

/** Cleared stages and books, derived from the XP ledger (§4). */
export function useLedgerFacts(): LedgerFacts {
  const xp = useApp((s) => s.xpEvents);
  return useMemo(() => ledgerFacts(xp), [xp]);
}

const NO_PAGES: ReadonlySet<number> = new Set();
const NO_STAGES: ReadonlySet<number> = new Set();

/** One book's game state: counted pages, cleared stages, cleared book. */
export function useBookGame(bookId: string): { counted: ReadonlySet<number>; clearedStages: ReadonlySet<number>; cleared: boolean } {
  const counted = useApp((s) => s.counted[bookId]) ?? NO_PAGES;
  const facts = useLedgerFacts();
  return { counted, clearedStages: facts.clearedStages.get(bookId) ?? NO_STAGES, cleared: facts.clearedBooks.has(bookId) };
}

/**
 * Library views derived from books, reading state, stats and counted pages.
 * Game manuals are left out while Settings → Game manuals is off (their progress stays stored).
 */
export function useBookViews(): BookView[] {
  const books = useApp((s) => s.books);
  const states = useApp((s) => s.states);
  const stats = useApp((s) => s.stats);
  const counted = useApp((s) => s.counted);
  const showManuals = useApp((s) => s.settings.gameManuals);
  const facts = useLedgerFacts();
  return useMemo(
    () =>
      Object.values(books)
        .filter((book) => showManuals || book.kind !== 'manual')
        .map((book) => {
          const st = states[book.id];
          const sv = stats[book.id];
          return {
            book,
            ...(st ? { state: st } : {}),
            ...(sv ? { stats: sv } : {}),
            progress: progressOf(book, counted[book.id]?.size ?? 0),
            cleared: facts.clearedBooks.has(book.id),
          };
        }),
    [books, states, stats, counted, facts, showManuals],
  );
}
