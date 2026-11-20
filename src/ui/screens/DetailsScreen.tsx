// Book details and stage map (§7.3, artboard BookDetails).

import { useMemo, useState } from 'react';
import type { Stage } from '../../core/models';
import { serpentineGraph } from '../../core/input/focus';
import { stageClearXp } from '../../core/gamification/levels';
import { BOOK_TROPHIES } from '../../core/gamification/trophies';
import { stageForPage, stageNumeral } from '../../core/stages/derive';
import { formatDuration } from '../../core/time';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useNav } from '../nav';
import { useApp } from '../store';
import { useGame } from '../game';
import { C, chakra } from '../tokens';
import { BreadcrumbHeader } from '../components/Header';
import { Button, PromptBar } from '../components/Glyph';
import { Bar, Eyebrow, Hex, StatTile } from '../components/Game';
import { Cover } from '../components/Cover';
import { Check } from '../components/Icons';
import { StageMap, geometry } from '../components/StageMap';
import { GoToPage } from './GoToPage';
import { BookmarksOverlay } from './BookmarksOverlay';

const EMPTY: Stage[] = [];
const NO_CLEARS = new Set<number>(); // stage clearing arrives with the game layer (M3)

export function DetailsScreen({ bookId }: { bookId: string }) {
  const nav = useNav();
  const book = useApp((s) => s.books[bookId]);
  const stages = useApp((s) => s.stages[bookId]) ?? EMPTY;
  const state = useApp((s) => s.states[bookId]);
  const stats = useApp((s) => s.stats[bookId]);
  const bookmarks = useApp((s) => s.bookmarks[bookId]);
  const game = useGame();
  const [overlay, setOverlay] = useState<null | 'goto' | 'bookmarks'>(null);

  const opened = book?.lastOpenedAt !== undefined;
  const page = state?.page ?? 1;
  const current = opened ? stageForPage(stages, page) : undefined;
  const ids = useMemo(() => stages.map((s) => String(s.index)), [stages]);
  const graph = useMemo(() => serpentineGraph(ids, geometry(stages.length).perRow), [ids, stages.length]);
  const { focused, setFocused, navigate } = useFocus(`details:${bookId}`, graph, String(current?.index ?? 0));
  const focusedStage = stages[Number(focused)] ?? stages[0];

  const jump = (st: Stage | undefined) => {
    if (!st) return;
    // Current stage → resume where you were; otherwise its first page.
    if (current && st.index === current.index) nav.openBook(bookId);
    else nav.openBook(bookId, st.startPage);
  };

  useInput(
    {
      context: 'details',
      onAction: (e) => {
        if (navigate(e.action)) return;
        const i = Number(focused);
        switch (e.action) {
          case 'stage_prev':
            if (i > 0) setFocused(String(i - 1));
            return;
          case 'stage_next':
            if (i < stages.length - 1) setFocused(String(i + 1));
            return;
          case 'confirm':
            return jump(focusedStage);
          case 'tertiary':
            return setOverlay('goto');
          case 'secondary':
            return setOverlay('bookmarks');
          case 'back':
            return nav.pop();
        }
      },
    },
    overlay === null,
  );

  if (!book) return null;

  const pct = book.pageCount ? Math.round(((opened ? page : 0) / book.pageCount) * 100) : 0;
  const secPerPage = stats && opened && page > 1 ? stats.activeMs / 1000 / (page - 1) : null;
  const left = secPerPage && stats && stats.activeMs > 60_000 ? `~${formatDuration((book.pageCount - page) * secPerPage * 1000, 'short')}` : '—';
  const sourceNote =
    book.stageSource === 'outline' ? "from the PDF's outline" : book.stageSource === 'headings' ? 'from detected section headings' : 'split evenly — no outline found';

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: C.bgBase }}>
      <BreadcrumbHeader trail={['Home', book.title]} />
      <main style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', gap: 40, padding: '28px 40px 24px' }}>
        <aside aria-label="Book" style={{ width: 340, flex: 'none', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', gap: 18 }}>
            <Cover book={book} width={120} height={168} radius={8} lift={false} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <h1 className="clamp2" style={{ margin: 0, font: chakra(600, 24, 1.15) }}>
                {book.title}
              </h1>
              {book.author ? (
                <span className="ellipsis" style={{ fontSize: 14, color: C.textMuted }}>
                  {book.author}
                </span>
              ) : null}
              <span style={{ fontSize: 13, color: C.textDim }}>PDF · {book.pageCount || '…'} pages</span>
              <div style={{ flex: 1 }} />
              <span style={{ font: chakra(700, 28), color: C.gold }}>{pct}%</span>
              <span style={{ fontSize: 12, color: C.textDim }}>
                p. {opened ? page : 1} of {book.pageCount}
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[
              [stats ? formatDuration(stats.activeMs) : '0 m', 'time read'],
              [left, 'left at your pace'],
              [String(stats?.sessions ?? 0), 'sessions'],
              [String(bookmarks?.length ?? 0), 'bookmarks'],
            ].map(([v, l]) => (
              <div key={l} style={{ padding: 14, borderRadius: 14, background: C.surface1, border: `1px solid ${C.line2}` }}>
                <StatTile value={v!} label={l!} />
              </div>
            ))}
          </div>
          {game.showXp ? <BookTrophies stageCount={stages.length} pageCount={book.pageCount} /> : null}
        </aside>

        <section aria-label="Stage map" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, font: chakra(600, 18), letterSpacing: '0.08em' }}>STAGE MAP</h2>
            <span style={{ fontSize: 13, color: C.textDim }}>{stages.length ? `${stages.length} stages · ${sourceNote}` : 'Reading the outline…'}</span>
          </div>
          {stages.length ? <StageMap stages={stages} currentIndex={current?.index ?? -1} cleared={NO_CLEARS} focusedIndex={Number(focused)} /> : <div style={{ height: 434 }} />}
          <div style={{ flex: 1 }} />
          {focusedStage ? <StageCard stage={focusedStage} isCurrent={focusedStage.index === current?.index} page={page} showXp={game.showXp} /> : null}
        </section>
      </main>
      <PromptBar
        prompts={[
          { glyphs: ['Dpad'], label: 'Choose stage' },
          { glyphs: ['A'], label: 'Jump here' },
          { glyphs: ['Y'], label: 'Go to page' },
          { glyphs: ['X'], label: 'Bookmarks' },
          { glyphs: ['B'], label: 'Back' },
        ]}
      />
      {overlay === 'goto' ? (
        <GoToPage
          pageCount={book.pageCount}
          start={focusedStage?.startPage ?? page}
          stages={stages}
          onGo={(p) => {
            setOverlay(null);
            nav.openBook(bookId, p);
          }}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === 'bookmarks' ? (
        <BookmarksOverlay
          bookId={bookId}
          onJump={(p) => {
            setOverlay(null);
            nav.openBook(bookId, p);
          }}
          onClose={() => setOverlay(null)}
        />
      ) : null}
    </div>
  );
}

export function StageCard({ stage, isCurrent, page, showXp, cleared = false }: { stage: Stage; isCurrent: boolean; page: number; showXp: boolean; cleared?: boolean }) {
  const len = stage.endPage - stage.startPage + 1;
  // Position within the stage until the game layer counts pages (M3).
  const at = isCurrent ? Math.max(1, Math.min(len, page - stage.startPage + 1)) : 0;
  const status = cleared ? 'CLEARED' : isCurrent ? 'IN PROGRESS' : 'NOT STARTED';
  const statusColor = cleared ? C.gold : isCurrent ? C.cyan : C.textMuted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '18px 22px', borderRadius: 18, background: C.surface1, border: `1px solid ${C.line3}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 250, minWidth: 0 }}>
        <Eyebrow size={12} color={statusColor}>
          {stage.isFinal ? 'FINAL STAGE' : `STAGE ${stageNumeral(stage).toUpperCase()}`} · {status}
        </Eyebrow>
        <span className="ellipsis" style={{ font: chakra(600, 22, 1.1) }}>
          {stage.label}
        </span>
        <span style={{ fontSize: 13, color: C.textDim }}>
          p. {stage.startPage}–{stage.endPage} · {len} page{len === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.textMuted }}>
          <span>
            {at} of {len} pages
          </span>
          {showXp ? (
            cleared ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: chakra(700, 13), color: C.gold }}>
                <Check size={13} color={C.gold} /> CLEARED
              </span>
            ) : (
              <span style={{ font: chakra(700, 13), color: C.gold }}>CLEAR FOR +{stageClearXp(len)} XP</span>
            )
          ) : null}
        </div>
        <Bar fraction={at / len} color={C.cyan} height={8} />
      </div>
      <Button glyph="A" label="JUMP HERE" size={15} />
    </div>
  );
}

function BookTrophies({ stageCount, pageCount }: { stageCount: number; pageCount: number }) {
  // Book progress for trophies comes from counted pages (M3); a fresh book until then.
  const snap = { pageCount, countedPages: 0, stageCount, firstStageCleared: false, cleared: false };
  const rows = BOOK_TROPHIES.map((t) => ({ t, p: t.progress(snap) }));
  const unlocked = rows.filter((r) => r.p.current >= r.p.target).length;
  return (
    <section aria-label="Book trophies" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, font: chakra(600, 13), letterSpacing: '0.16em', color: C.gold }}>BOOK TROPHIES</h2>
        <span style={{ font: chakra(600, 13), color: C.textMuted }}>
          {unlocked} / {rows.length}
        </span>
      </div>
      {rows.map(({ t, p }) => {
        const done = p.current >= p.target;
        const desc = t.describe ? t.describe(snap) : t.description;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Hex w={36} h={32} fill={done ? C.gold : C.track}>
              {done ? <Check size={14} /> : null}
            </Hex>
            {t.measurable && !done ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.textSecondary }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: C.textDim }}>
                    {p.current} / {p.target}%
                  </span>
                </div>
                <Bar fraction={p.current / p.target} color={C.textDim} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: done ? C.textPrimary : C.textSecondary }}>{t.name}</span>
                <span style={{ fontSize: 12, color: C.textDim }}>{desc}</span>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
