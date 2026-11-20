import { describe, expect, it } from 'vitest';
import { filterCounts, guessKind, prettifyFilename, sortViews, type BookView } from './library';
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
    ];
    expect(filterCounts(views)).toEqual({ all: 4, reading: 1, unread: 2, cleared: 1, papers: 1 });
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
