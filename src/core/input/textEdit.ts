// Text editing for the in-app keyboard (spec §7.8 Search): a string and a
// cursor, edited by key presses. Pure, so the keyboard is testable.

export interface TextState {
  text: string;
  /** Cursor position, 0..text.length. */
  cursor: number;
}

export function insert(s: TextState, chars: string, max = Infinity): TextState {
  const room = Math.max(0, max - s.text.length);
  const add = chars.slice(0, room);
  if (!add) return s;
  return { text: s.text.slice(0, s.cursor) + add + s.text.slice(s.cursor), cursor: s.cursor + add.length };
}

export function backspace(s: TextState): TextState {
  if (s.cursor === 0) return s;
  return { text: s.text.slice(0, s.cursor - 1) + s.text.slice(s.cursor), cursor: s.cursor - 1 };
}

export function moveCursor(s: TextState, d: number): TextState {
  return { ...s, cursor: Math.min(s.text.length, Math.max(0, s.cursor + d)) };
}

/** Capitalise the next letter at the start of the text or after a space. */
export function autoShift(s: TextState): boolean {
  return s.cursor === 0 || s.text[s.cursor - 1] === ' ';
}
