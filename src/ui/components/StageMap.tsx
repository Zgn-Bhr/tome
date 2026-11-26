// Serpentine stage map (§7.3, artboard BookDetails). Row 1 runs left→right,
// row 2 right→left, and so on. Used by Book details and the reader overlay.

import type { Stage } from '../../core/models';
import { stageNumeral } from '../../core/stages/derive';
import { C, VHEX, chakra } from '../tokens';
import { Check, Trophy } from './Icons';

export const MAP_W = 820;

interface Geometry {
  perRow: number;
  node: number;
  pitch: number;
  labelGap: number;
  xs: number[];
  visibleRows: number;
}

export function geometry(count: number): Geometry {
  if (count > 40) {
    const perRow = 7;
    const step = (755 - 65) / (perRow - 1);
    return { perRow, node: 40, pitch: 110, labelGap: 8, xs: Array.from({ length: perRow }, (_, i) => 65 + i * step), visibleRows: 3 };
  }
  return { perRow: 5, node: 56, pitch: 150, labelGap: 10, xs: [65, 237.5, 410, 582.5, 755], visibleRows: 3 };
}

export function stagePos(i: number, g: Geometry): { x: number; y: number; row: number } {
  const row = Math.floor(i / g.perRow);
  const inRow = i % g.perRow;
  const col = row % 2 === 0 ? inRow : g.perRow - 1 - inRow;
  return { x: g.xs[col]!, y: row * g.pitch + g.node / 2, row };
}

export type StageState = 'cleared' | 'current' | 'future';

export function StageMap({
  stages,
  currentIndex,
  cleared,
  focusedIndex,
  height = 400,
}: {
  stages: readonly Stage[];
  /** The stage holding the reading position, or -1 if the book is unopened. */
  currentIndex: number;
  cleared: ReadonlySet<number>;
  focusedIndex: number;
  height?: number;
}) {
  const g = geometry(stages.length);
  const rows = Math.ceil(stages.length / g.perRow);
  const focusRow = Math.floor(Math.max(0, focusedIndex) / g.perRow);
  const firstRow = Math.max(0, Math.min(rows - g.visibleRows, focusRow - 1));
  const stateOf = (i: number): StageState => (cleared.has(i) ? 'cleared' : i === currentIndex ? 'current' : 'future');

  return (
    <div style={{ position: 'relative', width: MAP_W + 20, height: height + 44, overflow: 'hidden', margin: '0 -10px', padding: '44px 10px 0' }}>
      <div style={{ position: 'relative', width: MAP_W, transform: `translateY(${-firstRow * g.pitch}px)`, transition: 'transform 200ms ease-out' }}>
        {stages.slice(0, -1).map((s, i) => {
          const a = stagePos(i, g);
          const b = stagePos(i + 1, g);
          const gold = cleared.has(i + 1) && cleared.has(i);
          const color = gold ? C.gold : C.track;
          if (a.row === b.row) {
            const left = Math.min(a.x, b.x);
            return <div key={`p${s.index}`} aria-hidden="true" style={{ position: 'absolute', left, top: a.y - 2, width: Math.abs(b.x - a.x), height: 4, borderRadius: 2, background: color }} />;
          }
          return <div key={`p${s.index}`} aria-hidden="true" style={{ position: 'absolute', left: a.x - 2, top: a.y, width: 4, height: b.y - a.y, background: color }} />;
        })}
        {stages.map((s, i) => (
          <Node key={s.index} stage={s} g={g} state={stateOf(i)} focused={i === focusedIndex} />
        ))}
      </div>
    </div>
  );
}

function Node({ stage, g, state, focused }: { stage: Stage; g: Geometry; state: StageState; focused: boolean }) {
  const p = stagePos(stage.index, g);
  const n = g.node;
  const numeral = stageNumeral(stage);
  const ring = focused
    ? { outline: `3px solid ${C.cyan}`, outlineOffset: 5, boxShadow: `0 0 0 11px rgba(88,199,230,0.14)${state === 'current' ? ', 0 0 28px rgba(88,199,230,0.35)' : ''}` }
    : {};
  const labelTop = p.y + n / 2 + g.labelGap + (focused ? 6 : 0);
  const compact = n < 56;

  let body;
  if (stage.isFinal) {
    const ow = compact ? 50 : 68;
    const oh = compact ? 54 : 72;
    const done = state === 'cleared';
    // The focus glow sits on a wrapper: clip-path would clip a filter on the hex itself.
    body = (
      <div
        style={{
          position: 'absolute',
          left: p.x - ow / 2,
          top: p.y - oh / 2,
          width: ow,
          height: oh,
          filter: focused ? 'drop-shadow(0 0 3px rgba(88,199,230,0.9)) drop-shadow(0 0 14px rgba(88,199,230,0.6))' : undefined,
        }}
      >
      <div
        style={{
          width: ow,
          height: oh,
          clipPath: VHEX,
          background: focused ? C.cyan : done ? C.gold : state === 'current' ? C.cyan : C.goldBorder,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: ow - 8,
            height: oh - 8,
            clipPath: VHEX,
            background: done ? C.gold : C.surfaceHexInner,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trophy size={compact ? 20 : 26} color={done ? C.goldOn : C.gold} />
        </div>
      </div>
      </div>
    );
  } else if (state === 'cleared') {
    body = (
      <div style={{ position: 'absolute', left: p.x - n / 2, top: p.y - n / 2, width: n, height: n, borderRadius: '50%', background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', ...ring }}>
        <Check size={compact ? 16 : 22} />
      </div>
    );
  } else if (state === 'current') {
    body = (
      <div
        style={{
          position: 'absolute',
          left: p.x - n / 2,
          top: p.y - n / 2,
          width: n,
          height: n,
          borderRadius: '50%',
          background: C.surfaceInset,
          border: `3px solid ${C.cyan}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: chakra(700, numeral.length > 3 ? 13 : compact ? 13 : 16),
          color: C.cyan,
          ...ring,
        }}
      >
        {numeral}
      </div>
    );
  } else {
    body = (
      <div
        style={{
          position: 'absolute',
          left: p.x - n / 2,
          top: p.y - n / 2,
          width: n,
          height: n,
          borderRadius: '50%',
          background: C.surfaceNode,
          border: `2px solid ${C.line4}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: chakra(700, numeral.length > 3 ? 13 : compact ? 12 : 15),
          color: C.textMuted,
          ...ring,
        }}
      >
        {numeral}
      </div>
    );
  }

  const labelColor = state === 'current' ? C.textPrimary : state === 'cleared' ? C.textMuted : C.textDim;
  return (
    <>
      {state === 'current' ? (
        <span style={{ position: 'absolute', left: p.x - 50, top: p.y - n / 2 - 30, width: 100, textAlign: 'center', font: chakra(700, 10), letterSpacing: '0.14em', color: C.cyan }}>
          YOU ARE HERE
        </span>
      ) : null}
      {body}
      <div
        style={{
          position: 'absolute',
          left: p.x - (compact ? 54 : 65),
          top: stage.isFinal ? p.y + (compact ? 27 : 36) + 2 : labelTop,
          width: compact ? 108 : 130,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          textAlign: 'center',
        }}
      >
        {stage.isFinal ? (
          <span style={{ font: chakra(600, 11), letterSpacing: '0.12em', color: C.gold }}>FINAL STAGE</span>
        ) : state !== 'future' && stage.numeral ? (
          <span style={{ font: chakra(600, 11), letterSpacing: '0.12em', color: state === 'current' ? C.cyan : C.textDim }}>{numeral.toUpperCase()}</span>
        ) : null}
        <span className="clamp2" style={{ fontSize: 13, color: labelColor, fontWeight: state === 'current' ? 600 : 400 }}>
          {stage.label}
        </span>
      </div>
    </>
  );
}
