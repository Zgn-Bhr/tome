import { describe, expect, it } from 'vitest';
import { gridGraph, link, mergeGraphs, move, rowGraph, rowsGraph, serpentineGraph } from './focus';

describe('focus graphs', () => {
  it('links a row left and right without wrapping', () => {
    const g = rowGraph(['a', 'b', 'c']);
    expect(move(g, 'a', 'right')).toBe('b');
    expect(move(g, 'a', 'left')).toBeNull();
    expect(move(g, 'c', 'right')).toBeNull();
  });

  it('builds a grid with a short last row', () => {
    const ids = ['0', '1', '2', '3', '4', '5', '6'];
    const g = gridGraph(ids, 5);
    expect(move(g, '1', 'down')).toBe('6');
    expect(move(g, '4', 'down')).toBe('6'); // no item below: go to the last one
    expect(move(g, '6', 'up')).toBe('1');
    expect(move(g, '4', 'right')).toBeNull();
    expect(move(g, '5', 'left')).toBeNull();
  });

  it('keeps the column between rows of different lengths', () => {
    const g = rowsGraph([['a0', 'a1', 'a2', 'a3'], [], ['b0', 'b1', 'b2']]);
    expect(move(g, 'a3', 'down')).toBe('b2');
    expect(move(g, 'b1', 'up')).toBe('a1');
    expect(move(g, 'b2', 'right')).toBeNull();
  });

  it('merges and links graphs', () => {
    const g = link(mergeGraphs(rowGraph(['hero', 'quest']), rowGraph(['c1', 'c2'])), 'hero', 'down', 'c1');
    expect(move(g, 'hero', 'down')).toBe('c1');
    expect(move(g, 'hero', 'right')).toBe('quest');
  });

  it('moves by screen position on the reversed serpentine row', () => {
    // Row 0: s0 s1 s2 s3 s4 (left→right). Row 1 is drawn reversed: s9 s8 s7 s6 s5.
    const ids = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const g = serpentineGraph(ids, 5);
    expect(move(g, 's4', 'down')).toBe('s5'); // s5 sits under s4 on the right
    expect(move(g, 's5', 'left')).toBe('s6');
    expect(move(g, 's9', 'up')).toBe('s0');
    expect(move(g, 's9', 'down')).toBe('s10'); // row 2 runs left→right again
    expect(move(g, 's6', 'down')).toBe('s11'); // short last row: nearest end
  });
});
