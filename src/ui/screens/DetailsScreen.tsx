// Book details and stage map (§7.3, artboard BookDetails).

import { useMemo, useState } from 'react';
import type { Stage } from '../../core/models';
import { serpentineGraph } from '../../core/input/focus';
import { stageClearXp } from '../../core/gamification/levels';
import { BOOK_TROPHIES, type BookSnapshot } from '../../core/gamification/trophies';
import { trophyKey } from '../../core/gamification/engine';
import { stageForPage, stageNumeral } from '../../core/stages/derive';
import { formatDuration } from '../../core/time';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useNav } from '../nav';
import { useApp, useBookGame } from '../store';
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

/** Seconds per counted page: this book's once it has 10, else across all books (§7.3). */
function usePace(bookId: string): number | null {
  const stats = useApp((s) => s.stats);
  const counted = useApp((s) => s.counted);
  return useMemo(() => {
    const own = counted[bookId]?.size ?? 0;
    if (own >= 10 && stats[bookId]) return stats[bookId]!.activeMs / 1000 / own;
    let ms = 0;
    let pages = 0;
    for (const [id, set] of Object.entries(counted)) {
      if (!set.size || !stats[id]) continue;
      ms += stats[id]!.activeMs;
      pages += set.size;
    }
    return pages >= 3 ? ms / 1000 / pages : null;
  }, [bookId, stats, counted]);
}

export function DetailsScreen({ bookId }: { bookId: string }) {
  const nav = useNav();
  const book = useApp((s) => s.books[bookId]);
  const stages = useApp((s) => s.stages[bookId]) ?? EMPTY;
  const state = useApp((s) => s.states[bookId]);
  const stats = useApp((s) => s.stats[bookId]);
  const bookmarks = useApp((s) => s.bookmarks[bookId]);
  const game = useGame();
  const bookGame = useBookGame(bookId);
  const pace = usePace(bookId);
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

  // Gold = earned: the percent of pages counted (§7.3), not the reading position.
  const countedN = bookGame.counted.size;
  const pct = book.pageCount ? Math.floor((countedN / book.pageCount) * 100) : 0;
  const remaining = Math.max(0, book.pageCount - countedN);
  const left = pace !== null && remaining > 0 ? `~${formatDuration(Math.max(60_000, remaining * pace * 1000), 'short')}` : remaining === 0 && book.pageCount ? 'done' : '—';
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
          {game.showXp ? (
            <BookTrophies
              bookId={bookId}
              unlocked={game.unlocked}
              snap={{ pageCount: book.pageCount, countedPages: countedN, stageCount: stages.length, firstStageCleared: bookGame.clearedStages.has(0), cleared: bookGame.cleared }}
            />
          ) : null}
        </aside>

        <section aria-label="Stage map" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, font: chakra(600, 18), letterSpacing: '0.08em' }}>STAGE MAP</h2>
            <span style={{ fontSize: 13, color: C.textDim }}>{stages.length ? `${stages.length} stages · ${sourceNote}` : 'Reading the outline…'}</span>
          </div>
          {stages.length ? <StageMap stages={stages} currentIndex={current?.index ?? -1} cleared={bookGame.clearedStages} focusedIndex={Number(focused)} /> : <div style={{ height: 434 }} />}
          <div style={{ flex: 1 }} />
          {focusedStage ? (
            <StageCard
              stage={focusedStage}
              isCurrent={focusedStage.index === current?.index}
              counted={bookGame.counted}
              showXp={game.showXp}
              cleared={bookGame.clearedStages.has(focusedStage.index)}
            />
          ) : null}
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

export function StageCard({
  stage,
  isCurrent,
  counted,
  showXp,
  cleared = false,
}: {
  stage: Stage;
  isCurrent: boolean;
  counted: ReadonlySet<number>;
  showXp: boolean;
  cleared?: boolean;
}) {
  const len = stage.endPage - stage.startPage + 1;
  let at = 0;
  for (let p = stage.startPage; p <= stage.endPage; p++) if (counted.has(p)) at++;
  const status = cleared ? 'CLEARED' : isCurrent || at > 0 ? 'IN PROGRESS' : 'NOT STARTED';
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
        <Bar fraction={at / len} color={cleared ? C.gold : C.cyan} height={8} />
      </div>
      <Button glyph="A" label="JUMP HERE" size={15} />
    </div>
  );
}

function BookTrophies({ bookId, unlocked: keys, snap }: { bookId: string; unlocked: ReadonlySet<string>; snap: BookSnapshot }) {
  const rows = BOOK_TROPHIES.map((t) => {
    const p = t.progress(snap);
    // An unlock is permanent even if the book's stages are re-derived later.
    return { t, p: keys.has(trophyKey(t.id, bookId)) ? { current: p.target, target: p.target } : p };
  });
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
