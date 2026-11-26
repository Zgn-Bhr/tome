// In-app keyboard (spec §7.8): D-pad + A types; L1/R1 move the cursor;
// Y = space, X = backspace, Menu = done, B = cancel. Steam's own keyboard
// isn't relied on, but typing on any keyboard also works.
//
// The parts are reusable: useTextEntry (state), TextField and KeyGrid
// (rendering). Keyboard is the pop-up dialog; Search embeds the parts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KEYS, KEY_ROWS, keyboardGraph, type KeyDef } from '../../core/input/keyboardLayout';
import { autoShift, backspace, insert, moveCursor, type TextState } from '../../core/input/textEdit';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { C, FONT, chakra } from '../tokens';
import { PromptItem } from './Glyph';
import { Scrim } from './Overlay';

export const KEY_UNIT = 62;
export const KEY_GAP = 6;
const KEY_H = 52;
export const GRID_W = 10 * KEY_UNIT + 9 * KEY_GAP;

/** Text, cursor and shift state, plus the edit operations the keys perform. */
export function useTextEntry(initial: string, max: number, { autoCapitalise = true } = {}) {
  const [s, setS] = useState<TextState>({ text: initial, cursor: initial.length });
  const [shiftFlip, setShiftFlip] = useState(false);
  const upper = (autoCapitalise && autoShift(s)) !== shiftFlip;

  const type = useCallback(
    (chars: string) => {
      setS((cur) => insert(cur, chars, max));
      setShiftFlip(false);
    },
    [max],
  );
  const erase = useCallback(() => setS(backspace), []);
  const cursor = useCallback((d: number) => setS((cur) => moveCursor(cur, d)), []);
  const clear = useCallback(() => setS({ text: '', cursor: 0 }), []);

  /** Press an on-screen key; returns 'done' when the done key was pressed. */
  const press = (k: KeyDef): 'done' | null => {
    if (k.char) type(upper ? k.char.toUpperCase() : k.char);
    else if (k.action === 'shift') setShiftFlip((f) => !f);
    else if (k.action === 'space') type(' ');
    else if (k.action === 'backspace') erase();
    else if (k.action === 'done') return 'done';
    return null;
  };

  return { s, upper, type, erase, cursor, clear, press };
}

export function TextField({ s, placeholder, error = false, width = GRID_W }: { s: TextState; placeholder?: string; error?: boolean; width?: number }) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(id);
  }, []);
  const caret = <span style={{ width: 2, height: 28, margin: '0 1px', background: blink ? C.cyan : 'transparent', flex: 'none' }} />;
  return (
    <div
      style={{
        width,
        height: 52,
        padding: '0 16px',
        borderRadius: 12,
        background: C.surfaceInset,
        border: `1px solid ${error ? C.goldBorder2 : C.line3}`,
        display: 'flex',
        alignItems: 'center',
        font: `500 22px/1 ${FONT.inter}`,
        whiteSpace: 'pre',
        overflow: 'hidden',
      }}
    >
      {s.text ? (
        <>
          <span>{s.text.slice(0, s.cursor)}</span>
          {caret}
          <span>{s.text.slice(s.cursor)}</span>
        </>
      ) : (
        <>
          {caret}
          <span style={{ marginLeft: 4, color: C.textDim }}>{placeholder}</span>
        </>
      )}
    </div>
  );
}

/** The key grid. `focused` is null when focus is elsewhere on the screen. */
export function KeyGrid({ focused, upper, doneLabel = 'DONE' }: { focused: string | null; upper: boolean; doneLabel?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: KEY_GAP }}>
      {KEY_ROWS.map((row, r) => (
        <div key={r} style={{ display: 'flex', gap: KEY_GAP }}>
          {row.map((k) => {
            const f = k.id === focused;
            const label = k.char ? (upper ? k.char.toUpperCase() : k.char) : k.action === 'done' ? doneLabel : k.label;
            const primary = k.action === 'done';
            const active = k.action === 'shift' && upper;
            return (
              <div
                key={k.id}
                className={`focusable${f ? ' is-focused' : ''}`}
                style={{
                  width: k.w * KEY_UNIT + (k.w - 1) * KEY_GAP,
                  height: KEY_H,
                  flex: 'none',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: primary ? C.gold : active ? C.surfaceInset : f ? C.glyphRing : C.surfaceButton2,
                  border: `1px solid ${primary ? C.gold : active ? C.cyan : C.glyphRing}`,
                  color: primary ? C.goldOn : active ? C.cyan : C.textPrimary,
                  font: k.char ? `500 20px/1 ${FONT.inter}` : chakra(700, 13),
                  letterSpacing: k.char ? 0 : '0.08em',
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Keyboard({
  title,
  initial = '',
  placeholder,
  max = 40,
  doneLabel = 'DONE',
  validate,
  onDone,
  onCancel,
}: {
  title: string;
  initial?: string;
  placeholder?: string;
  max?: number;
  doneLabel?: string;
  /** Returns an error message, or null when the text is acceptable. */
  validate?: (text: string) => string | null;
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const t = useTextEntry(initial, max);
  const [error, setError] = useState<string | null>(null);
  const graph = useMemo(() => keyboardGraph(), []);
  const { focused, navigate } = useFocus('keyboard', graph, 'k:1:0');

  const done = () => {
    const err = validate?.(t.s.text) ?? null;
    if (err) setError(err);
    else onDone(t.s.text);
  };

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (navigate(e.action)) return;
      setError(null);
      switch (e.action) {
        case 'confirm': {
          const k = KEYS[focused];
          if (k && t.press(k) === 'done') done();
          return;
        }
        case 'secondary':
          return t.erase();
        case 'tertiary':
          return t.type(' ');
        case 'tab_prev':
          return t.cursor(-1);
        case 'tab_next':
          return t.cursor(1);
        case 'menu':
          return done();
        case 'back':
          return onCancel();
      }
    },
    onText: (x) => {
      setError(null);
      if (typeof x === 'string') return t.type(x);
      if (x.key === 'backspace') return t.erase();
      if (x.key === 'enter') return done();
    },
  });

  return (
    <Scrim dim={0.7} onTop={80}>
      <div
        role="dialog"
        aria-label={title}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 40,
          transform: 'translateX(-50%)',
          padding: '24px 28px 20px',
          borderRadius: 24,
          background: C.surfaceModal,
          border: `1px solid ${C.line3}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, font: chakra(700, 18), letterSpacing: '0.12em' }}>{title}</h2>
          <span style={{ fontSize: 12, color: error ? C.gold : C.textDim }}>{error ?? `${t.s.text.length} / ${max}`}</span>
        </div>
        <TextField s={t.s} {...(placeholder ? { placeholder } : {})} error={!!error} />
        <KeyGrid focused={focused} upper={t.upper} doneLabel={doneLabel} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px 18px' }}>
          <PromptItem p={{ glyphs: ['A'], label: 'Type' }} size={13} gap={8} />
          <PromptItem p={{ glyphs: ['X'], label: 'Delete' }} size={13} gap={8} />
          <PromptItem p={{ glyphs: ['Y'], label: 'Space' }} size={13} gap={8} />
          <PromptItem p={{ glyphs: ['L1', 'R1'], label: 'Cursor' }} size={13} gap={8} />
          <PromptItem p={{ glyphs: ['Menu'], label: 'Done' }} size={13} gap={8} />
          <PromptItem p={{ glyphs: ['B'], label: 'Cancel' }} size={13} gap={8} />
        </div>
      </div>
    </Scrim>
  );
}
