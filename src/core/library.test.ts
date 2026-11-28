import { describe, expect, it } from 'vitest';
import {
  continueCandidate,
  filterCounts,
  guessKind,
  prettifyFilename,
  recentlyAdded,
  sortViews,
  startCandidate,
  visibleFilters,
  type BookView,
} from './library';
import type { Book } from './models';

const book = (id: string, over: Partial<Book> = {}): Book => ({
  id,
  path: `/x/${id}.pdf`,
  available: true,
  title: id,
  pageCount: 100,
  kind: 'book',
  hasTextLayer: true,
  isTwoColumn: false,
  addedAt: 0,
  stageSource: 'even',
  fileSize: 1,
  ...over,
});

const view = (b: Book, progress = 0, cleared = false): BookView => ({ book: b, progress, cleared });

describe('library', () => {
  it('counts filters', () => {
    const views = [
      view(book('a', { lastOpenedAt: 1 })),
      view(book('b')),
      view(book('c', { lastOpenedAt: 2 }), 1, true),
      view(book('d', { kind: 'paper' })),
      view(book('e', { kind: 'manual' })),
    ];
    const counts = filterCounts(views);
    expect(counts).toEqual({ all: 5, reading: 1, unread: 3, cleared: 1, papers: 1, manuals: 1 });
    expect(visibleFilters(counts)).toContain('manuals');
    expect(visibleFilters({ ...counts, manuals: 0 })).not.toContain('manuals');
  });

  it('keeps game manuals out of the way on Home', () => {
    const novel = view(book('novel', { lastOpenedAt: 10, addedAt: 1 }));
    const manual = view(book('manual', { kind: 'manual', lastOpenedAt: 20, addedAt: 30 }));
    const fresh = view(book('fresh', { addedAt: 5 }));
    const freshManual = view(book('freshManual', { kind: 'manual', addedAt: 40 }));
    // A book in progress beats a manual opened since; a manual only when nothing else is open.
    expect(continueCandidate([novel, manual])?.book.id).toBe('novel');
    expect(continueCandidate([manual, fresh])?.book.id).toBe('manual');
    // Never suggest starting a manual, and keep them off the Recently added shelf.
    expect(startCandidate([fresh, freshManual])?.book.id).toBe('fresh');
    expect(startCandidate([freshManual])).toBeUndefined();
    expect(recentlyAdded([novel, manual, fresh, freshManual], 7).map((v) => v.book.id)).toEqual(['fresh', 'novel']);
  });

  it('sorts by last read, then by added date', () => {
    const views = [view(book('a', { addedAt: 5 })), view(book('b', { lastOpenedAt: 10 })), view(book('c', { addedAt: 9 }))];
    expect(sortViews(views, 'last_read').map((v) => v.book.id)).toEqual(['b', 'c', 'a']);
    expect(sortViews(views, 'title').map((v) => v.book.id)).toEqual(['a', 'b', 'c']);
  });

  it('guesses papers', () => {
    expect(guessKind(18, true, false)).toBe('paper');
    expect(guessKind(18, false, true)).toBe('paper');
    expect(guessKind(18, false, false)).toBe('book');
    expect(guessKind(300, true, true)).toBe('book');
  });

  it('prettifies filenames', () => {
    expect(prettifyFilename('/a/b/review-sleep_regulation.pdf')).toBe('Review sleep regulation');
  });
});
