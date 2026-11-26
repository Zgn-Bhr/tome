// Session complete (§7.7, artboard SessionComplete). Shown after B in the
// reader when the session counted a page or earned XP.

import { useEffect, useState } from 'react';
import type { Stage, TrophyUnlock, XpEvent } from '../../core/models';
import { levelFromTotal } from '../../core/gamification/levels';
import type { StreakInfo, WeekDotState } from '../../core/gamification/streak';
import { BOOK_TROPHIES, GLOBAL_TROPHIES, type TrophyIcon } from '../../core/gamification/trophies';
import { useInput } from '../input/InputProvider';
import { useNav } from '../nav';
import { useApp } from '../store';
import { C, chakra } from '../tokens';
import { PromptBar } from '../components/Glyph';
import { Hex, WeekDots } from '../components/Game';
import { CalendarCheck, Check, Flame, Trophy } from '../components/Icons';

export interface SessionSummary {
  bookId: string;
  title: string;
  startPage: number;
  endPage: number;
  pages: number;
  activeMs: number;
  xp: XpEvent[];
  trophies: TrophyUnlock[];
  stageClears: Stage[];
  bookCleared: boolean;
  questDone: boolean;
  dailyGoal: number;
  xpBefore: number;
  streak: StreakInfo;
  week: WeekDotState[];
  /** Weekday index (Mon = 0) that this session qualified, for the halo. */
  qualifiedToday: number | null;
  /** The last page, captured for the blurred background. */
  background?: string;
}

const ANIM_DELAY = 300;
const ANIM_MS = 800;

/** 0 → 1 over 800 ms, starting 300 ms after the panel appears (§10.5). */
function useProgress(reduce: boolean): number {
  const [t, setT] = useState(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const start = performance.now() + ANIM_DELAY;
    const step = (now: number) => {
      const x = Math.min(1, Math.max(0, (now - start) / ANIM_MS));
      setT(1 - Math.pow(1 - x, 3));
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);
  return t;
}

export function SessionComplete({ s }: { s: SessionSummary }) {
  const nav = useNav();
  const intensity = useApp((st) => st.settings.gameIntensity);
  const reduce = useApp((st) => st.settings.reduceMotion);
  const full = intensity === 'full';
  const t = useProgress(reduce);

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (e.action === 'confirm' || e.action === 'back') nav.pop();
      if (e.action === 'tertiary') nav.replace({ name: 'reader', bookId: s.bookId });
    },
  });

  const gained = s.xp.reduce((a, e) => a + e.amount, 0);
  const pageXp = s.xp.filter((e) => e.reason === 'page').reduce((a, e) => a + e.amount, 0);
  const minutes = Math.round(s.activeMs / 60000);
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} m` : `${Math.max(minutes, s.activeMs > 0 ? 1 : 0)} min`;

  const tiles: [string, string, boolean][] = [
    [String(Math.round(s.pages * t)), 'pages read', false],
    [time, 'reading time', false],
  ];
  if (full) tiles.push([`+${Math.round(gained * t).toLocaleString('en-US')} XP`, 'earned this session', true]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bgReader, overflow: 'hidden' }}>
      {s.background ? (
        <img aria-hidden="true" src={s.background} alt="" style={{ position: 'absolute', left: 110, top: 0, width: 1060, height: 800, filter: 'blur(10px)', opacity: 0.5 }} />
      ) : null}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(7,9,15,0.86)' }} />
      <section
        aria-label="Session summary"
        style={{
          position: 'absolute',
          left: 160,
          top: 56,
          width: 960,
          padding: '34px 36px 32px',
          borderRadius: 24,
          background: C.surfaceModal,
          border: `1px solid ${C.line3}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fade-in 200ms ease-out',
        }}
      >
        <span className="ellipsis" style={{ fontSize: 14, color: C.textMuted }}>
          {s.title} · p. {s.startPage} → {s.endPage}
        </span>
        <h1 style={{ margin: '10px 0 0', font: chakra(700, 44), letterSpacing: '0.08em' }}>SESSION COMPLETE</h1>

        <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 14 }}>
          {tiles.map(([value, label, gold]) => (
            <div
              key={label}
              style={{
                padding: '18px 20px',
                borderRadius: 16,
                background: gold ? C.goldSurface : C.surfaceTile,
                border: `1px solid ${gold ? C.goldBorder : '#262E50'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <span style={{ font: chakra(700, 40), color: gold ? C.gold : C.textPrimary }}>{value}</span>
              <span style={{ fontSize: 13, color: gold ? C.goldTextSoft : C.textMuted }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 26, display: 'flex', gap: 28 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {full && pageXp > 0 ? <Line label="Pages read" detail={`× ${s.pages}`} value={pageXp} /> : null}
            {s.stageClears.map((st) => (
              <Line
                key={st.index}
                label="Stage clear"
                detail={`· ${st.numeral ? `${st.numeral} ` : ''}${st.label}`}
                value={full ? (s.xp.find((e) => e.reason === 'stage_clear' && e.stageIndex === st.index)?.amount ?? 0) : null}
              />
            ))}
            {s.bookCleared ? <Line label="Book clear" detail={`· ${s.title}`} value={full ? (s.xp.find((e) => e.reason === 'book_clear')?.amount ?? 0) : null} /> : null}
            {full && s.questDone ? <Line label="Daily quest" detail={`· ${s.dailyGoal} / ${s.dailyGoal} pages`} value={s.xp.find((e) => e.reason === 'daily_quest')?.amount ?? 0} /> : null}
            {full ? (
              <>
                <div aria-hidden="true" style={{ height: 1, background: C.line2, margin: '4px 0' }} />
                <LevelRow before={s.xpBefore} gained={gained} t={t} />
              </>
            ) : null}
            {!full && !s.stageClears.length && !s.bookCleared ? (
              <span style={{ fontSize: 15, color: C.textSecondary }}>Every counted page moves your stages forward.</span>
            ) : null}
          </div>
          <div style={{ width: 340, flex: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <StreakCard s={s} />
            {full ? <TrophyCards unlocks={s.trophies} /> : null}
          </div>
        </div>
      </section>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <PromptBar
          prompts={[
            { glyphs: ['Y'], label: 'Keep reading' },
            { glyphs: ['A'], label: 'Back to library', gold: true },
          ]}
        />
      </div>
    </div>
  );
}

function Line({ label, detail, value }: { label: string; detail: string; value: number | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, fontSize: 15 }}>
      <span className="ellipsis" style={{ color: C.textSecondary }}>
        {label} <span style={{ color: C.textDim }}>{detail}</span>
      </span>
      {value !== null ? <span style={{ flex: 'none', font: chakra(700, 15), color: C.gold }}>+{value.toLocaleString('en-US')}</span> : null}
    </div>
  );
}

function LevelRow({ before, gained, t }: { before: number; gained: number; t: number }) {
  const b = levelFromTotal(before);
  const a = levelFromTotal(before + gained);
  // The bar animates through the gained XP; once it crosses into a new level
  // it shows that level's bar and "LEVEL UP" (§7.7).
  const now = levelFromTotal(before + gained * t);
  const crossed = now.level > b.level;
  const deep = crossed ? 0 : b.intoLevel / b.needed;
  const bright = now.intoLevel / now.needed;
  const shown = now;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Hex w={46} h={42} fill={C.gold}>
        <span style={{ color: C.goldOn, font: chakra(700, 17) }}>{now.level}</span>
      </Hex>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div aria-hidden="true" style={{ position: 'relative', height: 12, borderRadius: 6, background: C.track, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, bright * 100)}%`, background: C.gold, boxShadow: '0 0 16px rgba(245,185,71,0.6)' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, deep * 100)}%`, background: C.goldDeep }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.textMuted }}>
          {crossed ? (
            <span style={{ font: chakra(700, 13), letterSpacing: '0.1em', color: C.gold }}>LEVEL UP · {now.level}</span>
          ) : (
            <span>
              <span style={{ color: C.textPrimary, fontWeight: 600 }}>{Math.round(shown.intoLevel).toLocaleString('en-US')}</span> / {shown.needed.toLocaleString('en-US')} XP
            </span>
          )}
          <span>
            {Math.max(0, Math.round(a.needed - a.intoLevel)).toLocaleString('en-US')} to level {a.level + 1}
          </span>
        </div>
      </div>
    </div>
  );
}

function StreakCard({ s }: { s: SessionSummary }) {
  const best = s.streak.current > 0 && s.streak.current >= s.streak.best;
  return (
    <div style={{ padding: '16px 18px', borderRadius: 16, background: C.surfaceTile, border: '1px solid #262E50', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Flame size={20} />
        <span style={{ font: chakra(700, 16), letterSpacing: '0.08em', color: C.gold }}>{s.streak.current ? `${s.streak.current}-DAY STREAK` : 'NO STREAK YET'}</span>
        {best ? <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textMuted }}>Personal best</span> : null}
      </div>
      <WeekDots states={s.week} size={28} {...(s.qualifiedToday !== null ? { halo: s.qualifiedToday } : {})} />
    </div>
  );
}

const ICONS: Record<TrophyIcon, (p: { size?: number; color?: string }) => React.ReactElement> = {
  calendar: CalendarCheck,
  trophy: Trophy,
  book: Trophy,
  flame: Flame,
  check: Check,
};

function TrophyCards({ unlocks }: { unlocks: TrophyUnlock[] }) {
  if (!unlocks.length) return null;
  const all = [...GLOBAL_TROPHIES, ...BOOK_TROPHIES];
  const shown = unlocks.slice(0, 2);
  return (
    <>
      {shown.map((u) => {
        const def = all.find((d) => d.id === u.trophyId);
        const Icon = ICONS[def?.icon ?? 'trophy'];
        return (
          <div
            key={u.trophyId + (u.bookId ?? '')}
            style={{
              padding: '16px 18px',
              borderRadius: 16,
              background: C.goldSurface2,
              border: `1px solid ${C.goldBorder2}`,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '0 0 30px rgba(245,185,71,0.12)',
            }}
          >
            <Hex w={56} h={50} fill={C.gold}>
              <Icon size={22} color={C.goldOn} />
            </Hex>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <span style={{ font: chakra(700, 12), letterSpacing: '0.16em', color: C.gold }}>TROPHY UNLOCKED</span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{def?.name ?? u.trophyId}</span>
              <span className="ellipsis" style={{ fontSize: 13, color: C.goldTextSoft }}>
                {def?.description}
              </span>
            </div>
          </div>
        );
      })}
      {unlocks.length > 2 ? <span style={{ fontSize: 13, color: C.goldTextSoft, paddingLeft: 4 }}>+{unlocks.length - 2} more</span> : null}
    </>
  );
}
