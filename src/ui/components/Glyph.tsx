// Controller glyphs, buttons and the footer prompt bar (§10.4, §7.0).

import type { CSSProperties, ReactNode } from 'react';
import { C, FONT, chakra } from '../tokens';
import { DpadIcon, MenuIcon, ViewIcon } from './Icons';

export type GlyphName =
  | 'A' | 'B' | 'X' | 'Y'
  | 'L1' | 'R1' | 'L2' | 'R2'
  | 'L4' | 'L5' | 'R4' | 'R5'
  | 'View' | 'Menu' | 'Dpad' | 'LS' | 'RS' | 'L3' | 'R3' | 'LP' | 'RP';

type Variant = 'default' | 'primary' | 'secondary' | 'gold';

export function Glyph({ name, variant = 'default', size = 28 }: { name: GlyphName; variant?: Variant; size?: number }) {
  const fill = variant === 'primary' ? C.goldOn : variant === 'secondary' ? C.glyphRing : C.glyphBg;
  const fg = variant === 'primary' || variant === 'gold' ? C.gold : C.glyphText;
  const goldFace = variant === 'gold';
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    color: goldFace ? C.goldOn : fg,
  };
  switch (name) {
    case 'A':
    case 'B':
    case 'X':
    case 'Y':
      return (
        <span style={{ ...base, width: size, height: size, borderRadius: '50%', background: goldFace ? C.gold : fill, font: chakra(700, Math.round(size / 2)) }}>
          {name}
        </span>
      );
    case 'L1':
    case 'R1':
      return (
        <span style={{ ...base, minWidth: 32, height: 24, padding: '0 6px', borderRadius: '8px 8px 4px 4px', background: C.glyphBg, color: C.glyphText, font: chakra(700, 12) }}>
          {name}
        </span>
      );
    case 'L2':
    case 'R2':
      return (
        <span style={{ ...base, minWidth: 32, height: 26, padding: '0 6px', borderRadius: '11px 11px 4px 4px', background: C.glyphBg, color: C.glyphText, font: chakra(700, 12) }}>
          {name}
        </span>
      );
    case 'L4':
    case 'L5':
    case 'R4':
    case 'R5':
      return (
        <span style={{ ...base, minWidth: 30, height: 24, padding: '0 5px', borderRadius: 6, border: `2px solid ${C.glyphOutline}`, color: C.glyphText, font: chakra(700, 11) }}>
          {name}
        </span>
      );
    case 'View':
      return (
        <span style={{ ...base, width: size, height: size, borderRadius: '50%', background: fill, color: C.glyphText }}>
          <ViewIcon />
        </span>
      );
    case 'Menu':
      return (
        <span style={{ ...base, width: size, height: size, borderRadius: '50%', background: fill, color: C.glyphText }}>
          <MenuIcon />
        </span>
      );
    case 'Dpad':
      return (
        <span style={{ ...base, width: size, height: size, borderRadius: '50%', background: fill, color: C.glyphText }}>
          <DpadIcon />
        </span>
      );
    case 'LS':
    case 'RS':
    case 'L3':
    case 'R3':
      return (
        <span
          style={{
            ...base,
            width: size,
            height: size,
            borderRadius: '50%',
            background: C.glyphBg,
            boxShadow: `inset 0 0 0 5px ${C.glyphBg}, inset 0 0 0 7px ${C.glyphOutline}`,
            color: C.glyphText,
            font: chakra(700, 9),
          }}
        >
          {name}
        </span>
      );
    case 'LP':
    case 'RP':
      return (
        <span style={{ ...base, width: 30, height: 28, borderRadius: 7, border: `2px solid ${C.glyphOutline}`, color: C.glyphText, font: chakra(700, 9) }}>
          {name}
        </span>
      );
  }
}

export interface Prompt {
  glyphs: GlyphName[];
  label: string;
  /** Gold face glyph to mark the default action (Session complete). */
  gold?: boolean;
}

export function PromptItem({ p, size = 15, gap = 10 }: { p: Prompt; size?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, fontSize: size, fontWeight: 500, color: C.textSecondary, whiteSpace: 'nowrap' }}>
      <span style={{ display: 'flex', gap: p.glyphs.length > 1 ? 4 : 0 }}>
        {p.glyphs.map((g) => (
          <Glyph key={g} name={g} variant={p.gold ? 'gold' : 'default'} />
        ))}
      </span>
      {p.label}
    </div>
  );
}

/** Footer prompt bar (60 px): primary action first, B last. */
export function PromptBar({ prompts, left }: { prompts: Prompt[]; left?: ReactNode }) {
  return (
    <footer
      style={{
        position: 'relative',
        height: 60,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 28,
        padding: '0 40px',
        borderTop: `1px solid ${C.line1}`,
        background: C.bgFooter,
      }}
    >
      {left ? <div style={{ marginRight: 'auto', fontSize: 13, color: C.textDim, display: 'flex', alignItems: 'center', gap: 10 }}>{left}</div> : null}
      {prompts.map((p) => (
        <PromptItem key={p.label + p.glyphs.join()} p={p} />
      ))}
    </footer>
  );
}

export function Button({
  glyph,
  label,
  kind = 'primary',
  focused = false,
  grow = false,
  size = 16,
}: {
  glyph: GlyphName;
  label: string;
  kind?: 'primary' | 'secondary';
  focused?: boolean;
  grow?: boolean;
  size?: number;
}) {
  const primary = kind === 'primary';
  return (
    <div
      className={`focusable${focused ? ' is-focused' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: grow ? 'center' : 'flex-start',
        flex: grow ? 1 : 'none',
        gap: 10,
        height: 46,
        padding: '0 22px 0 9px',
        border: primary ? 0 : `1px solid ${C.glyphRing}`,
        borderRadius: 23,
        background: primary ? C.gold : C.surfaceButton2,
        color: primary ? C.goldOn : C.textPrimary,
        font: chakra(700, size),
        letterSpacing: '0.06em',
        fontFamily: FONT.chakra,
      }}
    >
      <Glyph name={glyph} variant={primary ? 'primary' : 'secondary'} />
      {label}
    </div>
  );
}
