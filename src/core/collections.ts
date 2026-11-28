// Collections (spec §7.8): user shelves plus read-only smart ones.

import type { Book, BookId, Collection } from './models';
import { gameManual, systemName } from './manuals';

export const NAME_MAX = 40;

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * Smart collections are computed, never stored; their ids start with "smart:".
 * Papers, Books, then one "Game manuals · <system>" shelf per ES-DE system, by system name.
 */
export function smartCollections(books: readonly Book[]): Collection[] {
  const sorted = [...books].sort((a, b) => byName(a.title, b.title));
  const bySystem = new Map<string, BookId[]>();
  for (const b of sorted) {
    if (b.kind !== 'manual') continue;
    const name = systemName(gameManual(b.path)?.system ?? 'other');
    bySystem.set(name, [...(bySystem.get(name) ?? []), b.id]);
  }
  return [
    { id: 'smart:papers', name: 'Papers', smart: 'papers', bookIds: sorted.filter((b) => b.kind === 'paper').map((b) => b.id) },
    { id: 'smart:books', name: 'Books', smart: 'books', bookIds: sorted.filter((b) => b.kind === 'book').map((b) => b.id) },
    ...[...bySystem.keys()].sort(byName).map(
      (name): Collection => ({ id: `smart:manuals:${name}`, name: `Game manuals · ${name}`, smart: 'manuals', bookIds: bySystem.get(name)! }),
    ),
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
