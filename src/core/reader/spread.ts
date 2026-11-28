// Two-page view ("Two pages" fit): which pages face each other, and how a pair
// is laid out side by side so art spanning both pages lines up (no gap, no crop).
// Pure, so paging rules are unit-tested.

import type { Size } from './viewport';

/**
 * The first page of the spread that contains `page`. With `coverAlone`, page 1
 * stands alone (a cover or title page) and spreads are 2–3, 4–5… as in print;
 * without it they are 1–2, 3–4….
 */
export function spreadStart(page: number, pageCount: number, coverAlone: boolean): number {
  const p = Math.min(Math.max(1, Math.round(page)), Math.max(1, pageCount));
  if (coverAlone) return p === 1 ? 1 : p % 2 === 0 ? p : p - 1;
  return p % 2 === 1 ? p : p - 1;
}

/** The pages shown together: one (the cover, or a last page with no partner) or two. */
export function spreadPages(page: number, pageCount: number, coverAlone: boolean): number[] {
  const s = spreadStart(page, pageCount, coverAlone);
  if (coverAlone && s === 1) return [1];
  return s + 1 <= pageCount ? [s, s + 1] : [s];
}

/** The start of the next (d = 1) or previous (d = −1) spread, or null at either end. */
export function stepSpread(page: number, d: -1 | 1, pageCount: number, coverAlone: boolean): number | null {
  const shown = spreadPages(page, pageCount, coverAlone);
  const n = d > 0 ? shown[shown.length - 1]! + 1 : shown[0]! - 1;
  return n >= 1 && n <= pageCount ? spreadStart(n, pageCount, coverAlone) : null;
}

export interface SpreadPart {
  page: number;
  /** Left edge in spread units (the first page's points). */
  x: number;
  /** Spread units per point of this page (pages are scaled to one height). */
  scale: number;
  size: Size;
}

/** Lay pages side by side at the first page's height, edge to edge. */
export function spreadLayout(pages: readonly { page: number; size: Size }[]): { size: Size; parts: SpreadPart[] } {
  const h = pages[0]?.size.h ?? 1;
  let x = 0;
  const parts = pages.map(({ page, size }) => {
    const scale = h / size.h;
    const part = { page, x, scale, size };
    x += size.w * scale;
    return part;
  });
  return { size: { w: x, h }, parts };
}

/** "12–13", or "12" for a single page. */
export function pageLabel(pages: readonly number[]): string {
  return pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : String(pages[0] ?? '');
}
