import { describe, expect, it } from 'vitest';
import { pageLabel, spreadLayout, spreadPages, spreadStart, stepSpread } from './spread';

describe('two-page spreads', () => {
  it('keeps the cover alone and pairs 2–3, 4–5 like a printed book', () => {
    expect(spreadPages(1, 10, true)).toEqual([1]);
    expect(spreadPages(2, 10, true)).toEqual([2, 3]);
    expect(spreadPages(3, 10, true)).toEqual([2, 3]);
    expect(spreadPages(9, 10, true)).toEqual([8, 9]);
    expect(spreadPages(10, 10, true)).toEqual([10]); // back cover alone
    expect(spreadPages(9, 9, true)).toEqual([8, 9]);
  });

  it('pairs 1–2, 3–4 without the cover option', () => {
    expect(spreadPages(1, 10, false)).toEqual([1, 2]);
    expect(spreadPages(2, 10, false)).toEqual([1, 2]);
    expect(spreadStart(4, 10, false)).toBe(3);
    expect(spreadPages(9, 9, false)).toEqual([9]);
  });

  it('clamps out-of-range pages', () => {
    expect(spreadStart(0, 10, true)).toBe(1);
    expect(spreadStart(99, 10, true)).toBe(10);
    expect(spreadPages(1, 1, false)).toEqual([1]);
  });

  it('steps a whole spread at a time and stops at the ends', () => {
    expect(stepSpread(1, 1, 10, true)).toBe(2);
    expect(stepSpread(2, 1, 10, true)).toBe(4);
    expect(stepSpread(3, -1, 10, true)).toBe(1);
    expect(stepSpread(8, 1, 10, true)).toBe(10);
    expect(stepSpread(10, 1, 10, true)).toBeNull();
    expect(stepSpread(1, -1, 10, true)).toBeNull();
    expect(stepSpread(3, 1, 10, false)).toBe(5);
    expect(stepSpread(9, 1, 10, false)).toBeNull();
  });

  it('lays pages edge to edge at the first page height', () => {
    const { size, parts } = spreadLayout([
      { page: 2, size: { w: 400, h: 600 } },
      { page: 3, size: { w: 200, h: 300 } }, // half size: scaled up to match
    ]);
    expect(size).toEqual({ w: 800, h: 600 });
    expect(parts.map((p) => [p.page, p.x, p.scale])).toEqual([
      [2, 0, 1],
      [3, 400, 2],
    ]);
    expect(spreadLayout([{ page: 1, size: { w: 400, h: 600 } }]).size).toEqual({ w: 400, h: 600 });
  });

  it('labels spreads', () => {
    expect(pageLabel([12, 13])).toBe('12–13');
    expect(pageLabel([1])).toBe('1');
  });
});
