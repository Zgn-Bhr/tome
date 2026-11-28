// Library filters, sorting and the book/paper heuristic (spec §7.2).

import type { Book, BookKind, BookStats, ReadingState } from './models';

export type LibraryFilter = 'all' | 'reading' | 'unread' | 'cleared' | 'papers' | 'manuals';
export const FILTERS: readonly LibraryFilter[] = ['all', 'reading', 'unread', 'cleared', 'papers', 'manuals'];

/** The filters worth showing: Manuals only when there are game manuals. */
export function visibleFilters(counts: Record<LibraryFilter, number>): LibraryFilter[] {
  return FILTERS.filter((f) => f !== 'manuals' || counts.manuals > 0);
}

export type LibrarySort = 'last_read' | 'title' | 'recently_added' | 'progress';
export const SORTS: readonly LibrarySort[] = ['last_read', 'title', 'recently_added', 'progress'];
export const SORT_LABELS: Record<LibrarySort, string> = {
  last_read: 'Last read',
  title: 'Title',
  recently_added: 'Recently added',
  progress: 'Progress',
};

export const EMPTY_FILTER_HINTS: Record<LibraryFilter, string> = {
  all: 'Add a folder with PDFs to get started.',
  reading: 'Open a book to start reading it.',
  unread: 'Every book here has been opened.',
  cleared: 'Finish every stage of a book to clear it.',
  papers: 'Short two-column PDFs with an abstract show up here.',
  manuals: 'Game manuals that ES-DE downloads show up here.',
};

export interface BookView {
  book: Book;
  state?: ReadingState;
  stats?: BookStats;
  /** 0..1 share of the book's pages that are counted (§9.2) — earned, so drawn in gold. */
  progress: number;
  cleared: boolean;
}

export function progressOf(book: Book, countedPages: number): number {
  if (book.pageCount <= 0) return 0;
  return Math.min(1, countedPages / book.pageCount);
}

export function matchesFilter(v: BookView, f: LibraryFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'reading':
      return v.book.lastOpenedAt !== undefined && !v.cleared;
    case 'unread':
      return v.book.lastOpenedAt === undefined;
    case 'cleared':
      return v.cleared;
    case 'papers':
      return v.book.kind === 'paper';
    case 'manuals':
      return v.book.kind === 'manual';
  }
}

export function filterCounts(views: readonly BookView[]): Record<LibraryFilter, number> {
  const out = { all: 0, reading: 0, unread: 0, cleared: 0, papers: 0, manuals: 0 } as Record<LibraryFilter, number>;
  for (const v of views) for (const f of FILTERS) if (matchesFilter(v, f)) out[f]++;
  return out;
}

export function sortViews(views: readonly BookView[], sort: LibrarySort): BookView[] {
  const byTitle = (a: BookView, b: BookView) => a.book.title.localeCompare(b.book.title, undefined, { sensitivity: 'base' });
  const arr = [...views];
  switch (sort) {
    case 'title':
      return arr.sort(byTitle);
    case 'recently_added':
      return arr.sort((a, b) => b.book.addedAt - a.book.addedAt || byTitle(a, b));
    case 'progress':
      return arr.sort((a, b) => b.progress - a.progress || byTitle(a, b));
    case 'last_read':
      return arr.sort((a, b) => (b.book.lastOpenedAt ?? 0) - (a.book.lastOpenedAt ?? 0) || b.book.addedAt - a.book.addedAt);
  }
}

/** `paper` if ≤60 pages and (two-column or has an Abstract/References heading). */
export function guessKind(pageCount: number, isTwoColumn: boolean, hasPaperHeading: boolean): BookKind {
  return pageCount <= 60 && (isTwoColumn || hasPaperHeading) ? 'paper' : 'book';
}

/** Title from a filename: "review-sleep_regulation.pdf" → "Review sleep regulation". */
export function prettifyFilename(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const stem = base.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : base;
}

/**
 * Book continue order for Home: the most recently opened unfinished book.
 * Game manuals are looked up rather than read, so a book wins over a manual
 * opened since; a manual is the hero only when no book is in progress.
 */
export function continueCandidate(views: readonly BookView[]): BookView | undefined {
  const open = views
    .filter((v) => v.book.available && v.book.lastOpenedAt !== undefined && !v.cleared)
    .sort((a, b) => (b.book.lastOpenedAt ?? 0) - (a.book.lastOpenedAt ?? 0));
  return open.find((v) => v.book.kind !== 'manual') ?? open[0];
}

/** Most recently added unread book (Home's "START READING" fallback); never a game manual. */
export function startCandidate(views: readonly BookView[]): BookView | undefined {
  return views
    .filter((v) => v.book.available && v.book.lastOpenedAt === undefined && v.book.kind !== 'manual')
    .sort((a, b) => b.book.addedAt - a.book.addedAt)[0];
}

/** Home's Recently added shelf: books and papers (ES-DE adds manuals by the hundred). */
export function recentlyAdded(views: readonly BookView[], count: number): BookView[] {
  return sortViews(
    views.filter((v) => v.book.kind !== 'manual'),
    'recently_added',
  ).slice(0, count);
}
