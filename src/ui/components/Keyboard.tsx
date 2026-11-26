// In-app keyboard (spec §7.8): D-pad + A types; L1/R1 move the cursor;
// Y = space, X = backspace, Menu = done, B = cancel. Steam's own keyboard
// isn't relied on, but typing on any keyboard also works.

import { useEffect, useMemo, useState } from 'react';
import { KEYS, KEY_ROWS, keyboardGraph, type KeyDef } from '../../core/input/keyboardLayout';
import { autoShift, backspace, insert, moveCursor, type TextState } from '../../core/input/textEdit';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { C, FONT, chakra } from '../tokens';
import { PromptItem } from './Glyph';
import { Scrim } from './Overlay';

const UNIT = 62;
const GAP = 6;
const KEY_H = 52;

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
  const [s, setS] = useState<TextState>({ text: initial, cursor: initial.length });
  const [shiftFlip, setShiftFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graph = useMemo(() => keyboardGraph(), []);
  const { focused, navigate } = useFocus('keyboard', graph, 'k:1:0');
  const upper = autoShift(s) !== shiftFlip;

  const type = (chars: string) => {
    setError(null);
    setS((cur) => insert(cur, chars, max));
    setShiftFlip(false);
  };
  const done = () => {
    const err = validate?.(s.text) ?? null;
    if (err) setError(err);
    else onDone(s.text);
  };
  const press = (k: KeyDef) => {
    if (k.char) return type(upper ? k.char.toUpperCase() : k.char);
    switch (k.action) {
      case 'shift':
        return setShiftFlip((f) => !f);
      case 'space':
        return type(' ');
      case 'backspace':
        setError(null);
        return setS(backspace);
      case 'done':
        return done();
    }
  };

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (navigate(e.action)) return;
      switch (e.action) {
        case 'confirm': {
          const k = KEYS[focused];
          if (k) press(k);
          return;
        }
        case 'secondary':
          setError(null);
          return setS(backspace);
        case 'tertiary':
          return type(' ');
        case 'tab_prev':
          return setS((cur) => moveCursor(cur, -1));
        case 'tab_next':
          return setS((cur) => moveCursor(cur, 1));
        case 'menu':
          return done();
        case 'back':
          return onCancel();
      }
    },
    onText: (t) => {
      if (typeof t === 'string') return type(t);
      if (t.key === 'backspace') return setS(backspace);
      if (t.key === 'enter') return done();
    },
  });

  // Blinking cursor.
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(id);
  }, []);

  const width = 10 * UNIT + 9 * GAP;
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
          <span style={{ fontSize: 12, color: error ? C.gold : C.textDim }}>{error ?? `${s.text.length} / ${max}`}</span>
        </div>
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
              <span style={{ width: 2, height: 28, margin: '0 1px', background: blink ? C.cyan : 'transparent', flex: 'none' }} />
              <span>{s.text.slice(s.cursor)}</span>
            </>
          ) : (
            <>
              <span style={{ width: 2, height: 28, marginRight: 4, background: blink ? C.cyan : 'transparent', flex: 'none' }} />
              <span style={{ color: C.textDim }}>{placeholder}</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
          {KEY_ROWS.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: GAP }}>
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
                      width: k.w * UNIT + (k.w - 1) * GAP,
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
