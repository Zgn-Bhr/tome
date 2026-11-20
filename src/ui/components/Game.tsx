// Game-layer components: hex badges, ring, week dots, level block, streak,
// segmented progress and stat tiles (§10.4).

import type { ReactNode } from 'react';
import type { Stage } from '../../core/models';
import type { WeekDotState } from '../../core/gamification/streak';
import type { LevelInfo } from '../../core/gamification/levels';
import { C, HEX, chakra } from '../tokens';
import { Flame } from './Icons';

export function Hex({
  w,
  h,
  fill,
  children,
  outline,
  inner = C.surfaceHexInner,
}: {
  w: number;
  h: number;
  fill: string;
  children?: ReactNode;
  /** Outlined hex: `fill` is the ring, `inner` the centre. */
  outline?: { w: number; h: number };
  inner?: string;
}) {
  return (
    <div style={{ width: w, height: h, flex: 'none', clipPath: HEX, background: fill, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {outline ? (
        <div style={{ width: outline.w, height: outline.h, clipPath: HEX, background: inner, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

export function LevelBlock({ info }: { info: LevelInfo }) {
  const pct = Math.round((info.intoLevel / info.needed) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Hex w={42} h={38} fill={C.gold}>
        <span style={{ color: C.goldOn, font: chakra(700, 16) }}>{info.level}</span>
      </Hex>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ width: 120, height: 6, borderRadius: 3, background: C.track, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: C.gold }} />
        </div>
        <span style={{ fontSize: 12, color: C.textMuted }}>
          {info.intoLevel.toLocaleString('en-US')} / {info.needed.toLocaleString('en-US')} XP
        </span>
      </div>
    </div>
  );
}

export function StreakBadge({ days }: { days: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: chakra(700, 16), color: C.gold }}>
      <Flame />
      <span>
        {days} {days === 1 ? 'DAY' : 'DAYS'}
      </span>
    </div>
  );
}

/** 64 px ring, stroke 7, round cap, starting at 12 o'clock. */
export function Ring({ value, max, label }: { value: number; max: number; label: string }) {
  const r = 27;
  const circ = 2 * Math.PI * r;
  const frac = Math.min(1, max > 0 ? value / max : 0);
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={label} style={{ flex: 'none' }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke={C.track} strokeWidth="7" />
      {frac > 0 ? (
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={C.gold}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${frac * circ} ${circ}`}
          transform="rotate(-90 32 32)"
        />
      ) : null}
      <text x="32" y="38" textAnchor="middle" fontFamily="Chakra Petch, sans-serif" fontWeight="700" fontSize="17" fill={C.textPrimary}>
        {value}
      </text>
    </svg>
  );
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WeekDots({ states, size = 24, halo }: { states: WeekDotState[]; size?: number; halo?: number }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {states.map((s, i) => {
        const base = {
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: chakra(700, size > 24 ? 12 : 11),
        } as const;
        if (s === 'qualified')
          return (
            <span key={i} style={{ ...base, background: C.gold, color: C.goldOn, boxShadow: halo === i ? '0 0 0 4px rgba(245,185,71,0.25), 0 0 16px rgba(245,185,71,0.5)' : undefined }}>
              {DAY_LETTERS[i]}
            </span>
          );
        if (s === 'today-pending')
          return (
            <span key={i} style={{ ...base, border: `2px solid ${C.cyan}`, color: C.cyan }}>
              {DAY_LETTERS[i]}
            </span>
          );
        return (
          <span key={i} style={{ ...base, background: C.surfaceDot, color: C.textDim }}>
            {DAY_LETTERS[i]}
          </span>
        );
      })}
    </div>
  );
}

export type SegmentState = { kind: 'cleared' } | { kind: 'current'; fraction: number } | { kind: 'future' } | { kind: 'final' };

/** Equal-width stage segments (Home, Library panel): they read as stages. */
export function SegmentedProgress({ segments, height = 10, gap = 4, radius = 3 }: { segments: SegmentState[]; height?: number; gap?: number; radius?: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap }}>
      {segments.map((s, i) => (
        <Segment key={i} s={s} height={height} radius={radius} />
      ))}
    </div>
  );
}

export function Segment({ s, height, radius, flex = 1 }: { s: SegmentState; height: number; radius: number; flex?: number }) {
  const bg = s.kind === 'cleared' ? C.gold : s.kind === 'final' ? C.goldBorder : C.track;
  return (
    <div style={{ flex, minWidth: 2, height, borderRadius: radius, background: bg, overflow: 'hidden' }}>
      {s.kind === 'current' ? <div style={{ width: `${Math.round(s.fraction * 100)}%`, height: '100%', background: C.cyan }} /> : null}
    </div>
  );
}

/** Segment states for a book's stages at `page` (position-based until M3 counts pages). */
export function stageSegments(stages: readonly Stage[], page: number, clearedIdx: ReadonlySet<number> = new Set()): SegmentState[] {
  return stages.map((st) => {
    if (clearedIdx.has(st.index)) return { kind: 'cleared' };
    if (page >= st.startPage && page <= st.endPage) {
      const len = st.endPage - st.startPage + 1;
      return { kind: 'current', fraction: Math.max(0.04, (page - st.startPage + 1) / len) };
    }
    return { kind: 'future' };
  });
}

export function Bar({ fraction, color = C.gold, height = 4, track = C.track }: { fraction: number; color?: string; height?: number; track?: string }) {
  return (
    <div style={{ height, borderRadius: height / 2, background: track }}>
      {fraction > 0 ? <div style={{ width: `${Math.min(100, fraction * 100)}%`, height: '100%', borderRadius: height / 2, background: color }} /> : null}
    </div>
  );
}

export function StatTile({ value, label, large = false }: { value: string; label: string; large?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: large ? 8 : 5 }}>
      <span style={{ font: chakra(700, large ? 40 : 20) }}>{value}</span>
      <span style={{ fontSize: 12, color: C.textDim }}>{label}</span>
    </div>
  );
}

export function Eyebrow({ children, color = C.cyan, size = 13, spacing = '0.16em' }: { children: ReactNode; color?: string; size?: number; spacing?: string }) {
  return <span style={{ font: chakra(600, size), letterSpacing: spacing, color }}>{children}</span>;
}
