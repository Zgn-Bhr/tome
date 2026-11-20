// Keyboard fallback (spec §6.5) and back-grip key bindings.

import type { Button } from './actions';

export interface BackGripKeys {
  r4: string;
  l4: string;
  r5: string;
  l5: string;
}

export const DEFAULT_BACK_GRIP_KEYS: BackGripKeys = { r4: 'PageDown', l4: 'PageUp', r5: ']', l5: '[' };

const BASE: Record<string, Button> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'A',
  Escape: 'B',
  Backspace: 'B',
  x: 'X',
  y: 'Y',
  q: 'L1',
  e: 'R1',
  z: 'L2',
  c: 'R2',
  Tab: 'View',
  m: 'Menu',
};

/** Build the key → button table, with back-grip keys taken from settings. */
export function keyMap(grips: BackGripKeys = DEFAULT_BACK_GRIP_KEYS): Record<string, Button> {
  return {
    ...BASE,
    [grips.r4]: 'R4',
    [grips.l4]: 'L4',
    [grips.r5]: 'R5',
    [grips.l5]: 'L5',
  };
}

/** Normalise a KeyboardEvent.key so letters match regardless of Shift/Caps. */
export function normaliseKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}
