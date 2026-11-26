// The in-app keyboard grid (spec §7.8): letters, digits, space, backspace,
// shift and done. Rows are 10 units wide; up/down go to the key whose centre
// is nearest, so wide keys on the bottom row feel natural.

import type { FocusGraph } from './focus';

export type KeyAction = 'shift' | 'space' | 'backspace' | 'done';

export interface KeyDef {
  id: string;
  /** Character inserted (lowercase; shift uppercases letters). */
  char?: string;
  action?: KeyAction;
  label: string;
  /** Width in grid units. */
  w: number;
}

const charRow = (row: number, chars: string): KeyDef[] => [...chars].map((ch, i) => ({ id: `k:${row}:${i}`, char: ch, label: ch, w: 1 }));

export const KEY_ROWS: KeyDef[][] = [
  charRow(0, '1234567890'),
  charRow(1, 'qwertyuiop'),
  charRow(2, "asdfghjkl'"),
  charRow(3, 'zxcvbnm,.-'),
  [
    { id: 'k:4:0', action: 'shift', label: 'SHIFT', w: 2 },
    { id: 'k:4:1', action: 'space', label: 'SPACE', w: 4 },
    { id: 'k:4:2', action: 'backspace', label: 'DELETE', w: 2 },
    { id: 'k:4:3', action: 'done', label: 'DONE', w: 2 },
  ],
];

export const KEYS: Record<string, KeyDef> = Object.fromEntries(KEY_ROWS.flat().map((k) => [k.id, k]));

function centres(row: KeyDef[]): number[] {
  let x = 0;
  return row.map((k) => {
    const c = x + k.w / 2;
    x += k.w;
    return c;
  });
}

export function keyboardGraph(rows: KeyDef[][] = KEY_ROWS): FocusGraph {
  const g: FocusGraph = {};
  const cs = rows.map(centres);
  const nearest = (r: number, x: number): string | undefined => {
    const row = rows[r];
    const c = cs[r];
    if (!row || !c) return undefined;
    let best = 0;
    for (let i = 1; i < c.length; i++) if (Math.abs(c[i]! - x) < Math.abs(c[best]! - x)) best = i;
    return row[best]?.id;
  };
  rows.forEach((row, r) => {
    row.forEach((k, i) => {
      const x = cs[r]![i]!;
      g[k.id] = {
        ...(i > 0 ? { left: row[i - 1]!.id } : {}),
        ...(i < row.length - 1 ? { right: row[i + 1]!.id } : {}),
        ...(r > 0 ? { up: nearest(r - 1, x)! } : {}),
        ...(r < rows.length - 1 ? { down: nearest(r + 1, x)! } : {}),
      };
    });
  });
  return g;
}
