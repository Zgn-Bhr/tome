// A small external store for app data, read with useSyncExternalStore.

import { useMemo, useSyncExternalStore } from 'react';
import type { Book, BookStats, Bookmark, ReadingState, Settings, Stage, XpEvent } from '../core/models';
import { DEFAULT_SETTINGS } from '../core/settings';
import { progressOf, type BookView } from '../core/library';
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

/** Library views derived from books + reading state + stats. */
export function useBookViews(): BookView[] {
  const books = useApp((s) => s.books);
  const states = useApp((s) => s.states);
  const stats = useApp((s) => s.stats);
  return useMemo(
    () =>
      Object.values(books).map((book) => {
        const st = states[book.id];
        const sv = stats[book.id];
        return {
          book,
          ...(st ? { state: st } : {}),
          ...(sv ? { stats: sv } : {}),
          progress: progressOf(book, st),
          cleared: false, // arrives with the game layer (M3)
        };
      }),
    [books, states, stats],
  );
}
