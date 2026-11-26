// Reader HUD (§7.5, artboard ReaderHUD). Toggled with A; reading input keeps
// working underneath. Stage segments here are proportional to page count
// (they read as position), unlike Home's equal segments.

import type { Book, Bookmark, FitMode, GameIntensity, PageTheme, Stage } from '../../../core/models';
import { stageForPage, stageTitle } from '../../../core/stages/derive';
import { formatClock } from '../../../core/time';
import { C, PAGE_THEMES, chakra } from '../../tokens';
import { Glyph, PromptItem } from '../../components/Glyph';
import { Segment, type SegmentState } from '../../components/Game';
import { ChevronLeft, ChevronRight, Clock } from '../../components/Icons';

export function ReaderHud({
  book,
  stages,
  page,
  pageCount,
  fit,
  zoom,
  theme,
  bookmarks,
  sessionMs,
  intensity,
  sessionPages,
  sessionXp,
  cleared,
}: {
  book: Book;
  stages: readonly Stage[];
  page: number;
  pageCount: number;
  fit: FitMode;
  zoom: number;
  theme: PageTheme;
  bookmarks: readonly Bookmark[];
  sessionMs: number;
  intensity: GameIntensity;
  sessionPages: number;
  sessionXp: number;
  cleared: ReadonlySet<number>;
}) {
  const stage = stageForPage(stages, page);
  const pct = pageCount ? page / pageCount : 0;
  return (
    <>
      <header
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          background: C.hudBar,
          borderBottom: `1px solid ${C.line1}`,
          animation: 'hud-in-top 150ms ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500, color: C.textSecondary }}>
            <Glyph name="B" />
            Library
          </div>
          <span aria-hidden="true" style={{ width: 1, height: 28, background: C.line4 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <span className="ellipsis" style={{ font: chakra(600, 17), maxWidth: 760 }}>
              {book.title}
            </span>
            {stage ? (
              <span className="ellipsis" style={{ fontSize: 13, color: C.textMuted, maxWidth: 760 }}>
                Stage {stage.index + 1}/{stages.length} · {stageTitle(stage)}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={chip}>
            <Clock />
            {formatClock(sessionMs)}
          </span>
          {intensity !== 'off' ? <span style={chip}>+{sessionPages} {sessionPages === 1 ? 'PAGE' : 'PAGES'}</span> : null}
          {intensity === 'full' ? <span style={{ ...chip, background: C.goldSurface, border: `1px solid ${C.goldBorder}`, color: C.gold, font: chakra(700, 14) }}>+{sessionXp} XP</span> : null}
        </div>
      </header>

      <EdgeHint side="left" />
      <EdgeHint side="right" />

      <section
        aria-label="Reader controls"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '20px 28px 18px',
          background: C.hudPanel,
          borderTop: `1px solid ${C.line1}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          animation: 'hud-in-bottom 150ms ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ font: chakra(700, 14), letterSpacing: '0.06em', color: C.gold, width: 44 }}>{Math.round(pct * 100)}%</span>
          <div style={{ position: 'relative', flex: 1, height: 22 }}>
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 7, display: 'flex', gap: 3 }}>
              {stages.length ? (
                stages.map((s) => {
                  const len = s.endPage - s.startPage + 1;
                  const state: SegmentState = cleared.has(s.index)
                    ? { kind: 'cleared' }
                    : page >= s.startPage && page <= s.endPage
                      ? { kind: 'current', fraction: Math.max(0.04, (page - s.startPage + 1) / len) }
                      : s.isFinal
                        ? { kind: 'final' }
                        : { kind: 'future' };
                  return <Segment key={s.index} s={state} height={8} radius={2} flex={len} />;
                })
              ) : (
                <Segment s={{ kind: 'current', fraction: pct }} height={8} radius={2} />
              )}
            </div>
            {bookmarks.map((b) => (
              <span
                key={b.id}
                aria-label={`Bookmark p. ${b.page}`}
                style={{ position: 'absolute', left: `calc(${(b.page / pageCount) * 100}% - 5px)`, top: -6, width: 10, height: 10, background: C.gold, transform: 'rotate(45deg)' }}
              />
            ))}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${pct * 100}%`,
                top: 0,
                width: 22,
                height: 22,
                marginLeft: -11,
                borderRadius: '50%',
                background: C.bgBase,
                border: `4px solid ${C.cyan}`,
                boxShadow: '0 0 0 5px rgba(88,199,230,0.2)',
              }}
            />
          </div>
          <span style={{ font: chakra(600, 14), color: C.textPrimary, width: 96, textAlign: 'right' }}>
            p. {page} / {pageCount}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ModeChip label="FIT" value={fit.toUpperCase()} />
            <ModeChip label="ZOOM" value={`${Math.round(zoom * 100)}%`} />
            <ModeChip label="PAGE" value={PAGE_THEMES[theme].label} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {(
              [
                { glyphs: ['L1', 'R1'], label: 'Page' },
                { glyphs: ['L2', 'R2'], label: 'Zoom' },
                { glyphs: ['X'], label: 'Bookmark' },
                { glyphs: ['Y'], label: 'Stage map' },
                { glyphs: ['View'], label: 'Fit' },
                { glyphs: ['Menu'], label: 'Display' },
                { glyphs: ['A'], label: 'Hide' },
              ] as const
            ).map((p) => (
              <PromptItem key={p.label} p={{ glyphs: [...p.glyphs], label: p.label }} size={14} gap={9} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

const chip = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 34,
  padding: '0 14px',
  borderRadius: 17,
  background: C.surface1,
  border: `1px solid ${C.line3}`,
  font: chakra(600, 14),
  color: C.textPrimary,
} as const;

function ModeChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 32,
        padding: '0 12px',
        borderRadius: 8,
        background: C.surface1,
        border: `1px solid ${C.line3}`,
        font: chakra(600, 13),
        letterSpacing: '0.06em',
        color: C.textSecondary,
      }}
    >
      {label} <span style={{ color: C.textPrimary }}>{value}</span>
    </span>
  );
}

function EdgeHint({ side }: { side: 'left' | 'right' }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', [side]: 24, top: 376, display: 'flex', alignItems: 'center', gap: 6, color: C.textSecondary }}>
      {side === 'left' ? (
        <>
          <ChevronLeft />
          <Glyph name="L1" />
        </>
      ) : (
        <>
          <Glyph name="R1" />
          <ChevronRight />
        </>
      )}
    </div>
  );
}
