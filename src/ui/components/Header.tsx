// Library shell header (§7.0) and the breadcrumb variant (§7.3).

import { C, chakra } from '../tokens';
import { useGame } from '../game';
import { LevelBlock, StreakBadge } from './Game';
import { Glyph } from './Glyph';
import { BookLogo } from './Icons';

export const TABS = ['home', 'library', 'collections', 'trophies'] as const;
export type Tab = (typeof TABS)[number];

function GameBlock({ streak = true }: { streak?: boolean }) {
  const g = useGame();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, width: 300, justifyContent: 'flex-end' }}>
      {g.showXp ? <LevelBlock info={g.level} /> : null}
      {streak && g.showStreak ? <StreakBadge days={g.streak.current} /> : null}
    </div>
  );
}

const headerStyle = {
  position: 'relative',
  height: 76,
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 40px',
  borderBottom: `1px solid ${C.line1}`,
} as const;

export function LibraryHeader({ tab }: { tab: Tab }) {
  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 300 }}>
        <BookLogo />
        <span style={{ font: chakra(700, 22), letterSpacing: '0.18em' }}>TOME</span>
      </div>
      <nav aria-label="Sections" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Glyph name="L1" />
        {TABS.map((t) => (
          <div
            key={t}
            style={{
              padding: '0 16px',
              height: 76,
              display: 'flex',
              alignItems: 'center',
              font: chakra(600, 16),
              letterSpacing: '0.08em',
              color: t === tab ? C.textPrimary : C.textMuted,
              boxShadow: t === tab ? `inset 0 -3px 0 ${C.gold}` : undefined,
            }}
          >
            {t.toUpperCase()}
          </div>
        ))}
        <Glyph name="R1" />
      </nav>
      <GameBlock />
    </header>
  );
}

export function BreadcrumbHeader({ trail }: { trail: string[] }) {
  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: chakra(600, 14), letterSpacing: '0.12em', color: C.textDim, minWidth: 0 }}>
        <BookLogo size={26} />
        {trail.map((t, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            <span className={i === trail.length - 1 ? 'ellipsis' : undefined} style={{ color: i === trail.length - 1 ? C.textPrimary : undefined, maxWidth: 700 }}>
              {t.toUpperCase()}
            </span>
          </span>
        ))}
      </div>
      <GameBlock streak={false} />
    </header>
  );
}
