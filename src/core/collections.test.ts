import { describe, expect, it } from 'vitest';
import type { Book, Collection } from './models';
import { cleanName, smartCollections, toggleBook, visibleBooks } from './collections';
import { autoShift, backspace, insert, moveCursor } from './input/textEdit';
import { keyboardGraph } from './input/keyboardLayout';
import { move } from './input/focus';

const book = (id: string, title: string, kind: Book['kind']): Book => ({
  id,
  path: `/x/${id}.pdf`,
  available: true,
  title,
  pageCount: 10,
  kind,
  hasTextLayer: true,
  isTwoColumn: false,
  addedAt: 0,
  stageSource: 'even',
  fileSize: 1,
});

describe('collections', () => {
  it('builds smart Papers and Books shelves sorted by title', () => {
    const [papers, books] = smartCollections([book('a', 'Zeta', 'book'), book('b', 'Alpha', 'paper'), book('c', 'Beta', 'book')]);
    expect(papers).toMatchObject({ id: 'smart:papers', smart: 'papers', bookIds: ['b'] });
    expect(books!.bookIds).toEqual(['c', 'a']);
  });

  it('toggles membership, newest first', () => {
    const c: Collection = { id: '1', name: 'Fav', bookIds: ['a'] };
    expect(toggleBook(c, 'b').bookIds).toEqual(['b', 'a']);
    expect(toggleBook(c, 'a').bookIds).toEqual([]);
  });

  it('cleans names', () => {
    expect(cleanName('  Summer   reading ')).toBe('Summer reading');
    expect(cleanName('   ')).toBe('');
    expect(cleanName('x'.repeat(60))).toHaveLength(40);
  });

  it('hides books that left the library', () => {
    expect(visibleBooks({ id: '1', name: 'A', bookIds: ['a', 'gone'] }, new Set(['a']))).toEqual(['a']);
  });
});

describe('text editing', () => {
  it('inserts at the cursor and respects the max length', () => {
    const s = insert({ text: 'ac', cursor: 1 }, 'b');
    expect(s).toEqual({ text: 'abc', cursor: 2 });
    expect(insert({ text: 'abc', cursor: 3 }, 'de', 4)).toEqual({ text: 'abcd', cursor: 4 });
  });

  it('deletes before the cursor and moves within bounds', () => {
    expect(backspace({ text: 'abc', cursor: 2 })).toEqual({ text: 'ac', cursor: 1 });
    expect(backspace({ text: 'abc', cursor: 0 })).toEqual({ text: 'abc', cursor: 0 });
    expect(moveCursor({ text: 'abc', cursor: 2 }, 5).cursor).toBe(3);
    expect(moveCursor({ text: 'abc', cursor: 2 }, -5).cursor).toBe(0);
  });

  it('auto-capitalises at the start and after a space', () => {
    expect(autoShift({ text: '', cursor: 0 })).toBe(true);
    expect(autoShift({ text: 'Summer ', cursor: 7 })).toBe(true);
    expect(autoShift({ text: 'Su', cursor: 2 })).toBe(false);
  });
});

describe('keyboard layout', () => {
  const g = keyboardGraph();
  it('moves left and right within a row without wrapping', () => {
    expect(move(g, 'k:1:0', 'right')).toBe('k:1:1');
    expect(move(g, 'k:1:0', 'left')).toBeNull();
  });

  it('goes down to the nearest key on the wide bottom row', () => {
    expect(move(g, 'k:3:4', 'down')).toBe('k:4:1'); // "b" → SPACE
    expect(move(g, 'k:3:9', 'down')).toBe('k:4:3'); // "-" → DONE
    expect(move(g, 'k:3:0', 'down')).toBe('k:4:0'); // "z" → SHIFT
    expect(move(g, 'k:4:1', 'up')).toBe('k:3:3'); // SPACE → "v"/"b" region
  });
});
