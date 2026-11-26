// Collections (spec §7.8): user shelves plus read-only smart ones.

import type { Book, BookId, Collection } from './models';

export const NAME_MAX = 40;

/** Smart collections are computed, never stored; their ids start with "smart:". */
export function smartCollections(books: readonly Book[]): Collection[] {
  const sorted = [...books].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return [
    { id: 'smart:papers', name: 'Papers', smart: 'papers', bookIds: sorted.filter((b) => b.kind === 'paper').map((b) => b.id) },
    { id: 'smart:books', name: 'Books', smart: 'books', bookIds: sorted.filter((b) => b.kind === 'book').map((b) => b.id) },
  ];
}

export const isSmart = (c: Collection): boolean => c.smart !== undefined;

/** Add the book if missing, remove it if present. New books go first. */
export function toggleBook(c: Collection, bookId: BookId): Collection {
  return c.bookIds.includes(bookId) ? { ...c, bookIds: c.bookIds.filter((id) => id !== bookId) } : { ...c, bookIds: [bookId, ...c.bookIds] };
}

/** Trim, collapse spaces and cap the length; empty means invalid. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Drop ids of books that are no longer in the library. */
export function visibleBooks(c: Collection, known: ReadonlySet<BookId>): BookId[] {
  return c.bookIds.filter((id) => known.has(id));
}
