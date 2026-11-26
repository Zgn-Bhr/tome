// Page coverage (spec §9.2): which share of the page's area has been inside
// the viewport. A coarse grid handles zoom and horizontal panning as well as
// plain vertical scrolling.

import { GAME } from './config';
import { dwellThresholdSec } from './levels';

export const GRID = 24;

/** A viewport rectangle in page fractions (0..1 on both axes). */
export interface PageRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class CoverageGrid {
  private cells = new Uint8Array(GRID * GRID);
  private marked = 0;
  /** Coverage carried over from an earlier session (the grid itself isn't stored). */
  constructor(private carried = 0) {}

  /** Mark every cell whose centre lies inside the rectangle. */
  mark(r: PageRect): void {
    const c0 = Math.max(0, Math.ceil(r.x0 * GRID - 0.5));
    const c1 = Math.min(GRID - 1, Math.floor(r.x1 * GRID - 0.5));
    const r0 = Math.max(0, Math.ceil(r.y0 * GRID - 0.5));
    const r1 = Math.min(GRID - 1, Math.floor(r.y1 * GRID - 0.5));
    for (let y = r0; y <= r1; y++) {
      for (let x = c0; x <= c1; x++) {
        const i = y * GRID + x;
        if (!this.cells[i]) {
          this.cells[i] = 1;
          this.marked++;
        }
      }
    }
  }

  fraction(): number {
    return Math.max(this.carried, this.marked / (GRID * GRID));
  }

  /** Fold in coverage stored by an earlier session. */
  carry(fraction: number): void {
    this.carried = Math.max(this.carried, fraction);
  }
}

/** A page counts once it was visible long enough and enough of it was seen. */
export function shouldCount(dwellMs: number, words: number | null, coverage: number): boolean {
  return dwellMs >= dwellThresholdSec(words) * 1000 && coverage >= GAME.coverageToCount;
}

/** Words on a page, or null when it has no text layer (scans). */
export function wordsOrNull(words: number, chars: number): number | null {
  return chars < 20 ? null : words;
}
