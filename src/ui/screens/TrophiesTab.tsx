// Trophies tab (spec §7.8, not designed — kept in the same system as the
// Home trophy card and Session complete): hex badges grouped Global and Per
// book; unlocked ones gold, locked ones with a progress bar. A shows details.

import { useMemo, useState } from 'react';
import { BOOK_TROPHIES, GLOBAL_TROPHIES, type BookSnapshot, type BookTrophy, type GlobalTrophy } from '../../core/gamification/trophies';
import { trophyKey } from '../../core/gamification/engine';
import { rowsGraph } from '../../core/input/focus';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useNav } from '../nav';
import { useApp, useBookViews, useLedgerFacts } from '../store';
import { useGame } from '../game';
import { C, chakra } from '../tokens';
import { PromptBar } from '../components/Glyph';
import { Bar, Eyebrow, Hex } from '../components/Game';
import { Dialog } from '../components/Overlay';
import { TrophyGlyph } from '../components/TrophyGlyph';
import type { TabProps } from './LibraryScreen';

const COLS = 4;
const CARD_H = 104;
const ROW_GAP = 16;
const HEADER_H = 24 + 14;
const SECTION_GAP = 30;
const VIEW_H = 800 - 76 - 60 - 28;

interface Item {
  id: string;
  def: GlobalTrophy | BookTrophy;
  current: number;
  target: number;
  unlockedAt?: number;
  description: string;
  bookTitle?: string;
}

const shortDate = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function TrophiesTab({ cycleTab, goTab }: TabProps) {
  const nav = useNav();
  const game = useGame();
  const facts = useLedgerFacts();
  const views = useBookViews();
  const unlocks = useApp((s) => s.trophies);
  const counted = useApp((s) => s.counted);
  const stages = useApp((s) => s.stages);
  const pagesByDay = useApp((s) => s.pagesByDay);
  const bestSessionPages = useApp((s) => s.bestSessionPages);
  const [detail, setDetail] = useState<Item | null>(null);

  const unlockAt = useMemo(() => new Map(unlocks.map((u) => [trophyKey(u.trophyId, u.bookId), u.at])), [unlocks]);

  const global: Item[] = useMemo(() => {
    const snap = {
      countedPagesTotal: [...pagesByDay.values()].reduce((a, b) => a + b, 0),
      streak: game.streak.current,
      bestStreak: game.streak.best,
      booksCleared: facts.booksCleared,
      stagesCleared: facts.stagesCleared,
      bestSessionPages,
    };
    return GLOBAL_TROPHIES.map((def) => {
      const p = def.progress(snap);
      const at = unlockAt.get(trophyKey(def.id));
      return { id: `g:${def.id}`, def, ...p, ...(at ? { unlockedAt: at, current: p.target } : {}), description: def.description };
    });
  }, [pagesByDay, game.streak, facts, bestSessionPages, unlockAt]);

  // Books you've opened, most recent first.
  const books = useMemo(
    () =>
      views
        .filter((v) => v.book.lastOpenedAt !== undefined)
        .sort((a, b) => (b.book.lastOpenedAt ?? 0) - (a.book.lastOpenedAt ?? 0))
        .map((v) => {
          const snap: BookSnapshot = {
            pageCount: v.book.pageCount,
            countedPages: counted[v.book.id]?.size ?? 0,
            stageCount: stages[v.book.id]?.length ?? 0,
            firstStageCleared: facts.clearedStages.get(v.book.id)?.has(0) ?? false,
            cleared: v.cleared,
          };
          const items: Item[] = BOOK_TROPHIES.map((def) => {
            const p = def.progress(snap);
            const at = unlockAt.get(trophyKey(def.id, v.book.id));
            return {
              id: `b:${v.book.id}:${def.id}`,
              def,
              ...p,
              ...(at ? { unlockedAt: at, current: p.target } : {}),
              description: def.describe ? def.describe(snap) : def.description,
              bookTitle: v.book.title,
            };
          });
          return { book: v.book, items };
        }),
    [views, counted, stages, facts, unlockAt],
  );

  const rows = useMemo(() => {
    const out: Item[][] = [];
    for (let i = 0; i < global.length; i += COLS) out.push(global.slice(i, i + COLS));
    for (const b of books) out.push(b.items);
    return out;
  }, [global, books]);
  const graph = useMemo(() => rowsGraph(rows.map((r) => r.map((it) => it.id))), [rows]);
  const { focused, navigate } = useFocus('trophies', graph, rows[0]?.[0]?.id);
  const all = useMemo(() => rows.flat(), [rows]);
  const current = all.find((it) => it.id === focused);

  useInput(
    {
      context: 'library',
      onAction: (e) => {
        if (navigate(e.action)) return;
        if (e.action === 'tab_prev') return cycleTab(-1);
        if (e.action === 'tab_next') return cycleTab(1);
        if (e.action === 'confirm' && current) return setDetail(current);
        if (e.action === 'tertiary') return nav.push({ name: 'search' });
        if (e.action === 'menu') return nav.showSettings();
        if (e.action === 'back') return goTab('home');
      },
    },
    detail === null,
  );

  if (!game.showXp) {
    return (
      <>
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', alignItems: 'center' }}>
            <Eyebrow>TROPHIES</Eyebrow>
            <span style={{ font: chakra(600, 24) }}>Hidden in {game.intensity === 'light' ? 'Light' : 'Off'} mode</span>
            <span style={{ fontSize: 15, lineHeight: 1.5, color: C.textMuted }}>
              Tome keeps tracking quietly. Set Game layer to Full in Settings (Menu) to see your trophies again.
            </span>
          </div>
        </main>
        <PromptBar
          prompts={[
            { glyphs: ['L1', 'R1'], label: 'Tabs' },
            { glyphs: ['Menu'], label: 'Settings' },
            { glyphs: ['B'], label: 'Home' },
          ]}
        />
      </>
    );
  }

  // Keep the focused row in view, with some context above it.
  const rowIdx = rows.findIndex((r) => r.some((it) => it.id === focused));
  const globalRows = Math.ceil(global.length / COLS);
  const rowTop = (i: number) =>
    HEADER_H + (i < globalRows ? i * (CARD_H + ROW_GAP) : globalRows * (CARD_H + ROW_GAP) + SECTION_GAP + HEADER_H + (i - globalRows) * (CARD_H + ROW_GAP));
  const totalH = rowTop(rows.length) + 40;
  const offset = Math.max(0, Math.min(Math.max(0, totalH - VIEW_H), rowTop(Math.max(0, rowIdx)) - 140));
  const globalUnlocked = global.filter((g) => g.unlockedAt).length;

  return (
    <>
      <main style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', padding: '28px 40px 0' }}>
        <div style={{ transform: `translateY(${-offset}px)`, transition: 'transform 180ms ease-out' }}>
          <SectionHeader title="GLOBAL" note={`${globalUnlocked} / ${global.length} unlocked`} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: ROW_GAP }}>
            {global.map((it) => (
              <Card key={it.id} it={it} focused={it.id === focused} />
            ))}
          </div>
          <div style={{ height: SECTION_GAP }} />
          <SectionHeader title="PER BOOK" note={books.length ? `${books.length} ${books.length === 1 ? 'book' : 'books'} opened` : ''} />
          {books.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
              {books.map((b) => (
                <div key={b.book.id} style={{ display: 'flex', gap: ROW_GAP, alignItems: 'center' }}>
                  <span className="clamp2" style={{ width: 240, flex: 'none', font: chakra(600, 15, 1.3), color: b.items.some((it) => it.id === focused) ? C.textPrimary : C.textSecondary }}>
                    {b.book.title}
                  </span>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: ROW_GAP }}>
                    {b.items.map((it) => (
                      <Card key={it.id} it={it} focused={it.id === focused} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 14, color: C.textMuted }}>Open a book to start its trophies: First Steps, Halfway There and Cover to Cover.</span>
          )}
        </div>
      </main>
      <PromptBar
        prompts={[
          { glyphs: ['A'], label: 'Details' },
          { glyphs: ['L1', 'R1'], label: 'Tabs' },
          { glyphs: ['Y'], label: 'Search' },
          { glyphs: ['Menu'], label: 'Settings' },
          { glyphs: ['B'], label: 'Home' },
        ]}
      />
      {detail ? <TrophyDetail it={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

function SectionHeader({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', height: 24, marginBottom: 14 }}>
      <h2 style={{ margin: 0, font: chakra(600, 18), letterSpacing: '0.08em' }}>{title}</h2>
      <span style={{ fontSize: 13, color: C.textDim }}>{note}</span>
    </div>
  );
}

function Card({ it, focused }: { it: Item; focused: boolean }) {
  const done = !!it.unlockedAt;
  return (
    <div
      className={`focusable${focused ? ' is-focused' : ''}`}
      style={{
        height: CARD_H,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderRadius: 16,
        background: done ? C.goldSurface2 : C.surface1,
        border: `1px solid ${done ? C.goldBorder2 : C.line2}`,
        boxShadow: done && !focused ? '0 0 24px rgba(245,185,71,0.08)' : undefined,
      }}
    >
      <Hex w={46} h={42} fill={done ? C.gold : C.track}>
        <TrophyGlyph icon={it.def.icon} size={20} color={done ? C.goldOn : C.textDim} />
      </Hex>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span className="ellipsis" style={{ fontSize: 15, fontWeight: 600, color: done ? C.textPrimary : C.textSecondary }}>
          {it.def.name}
        </span>
        <span className="ellipsis" style={{ fontSize: 12, color: done ? C.goldTextSoft : C.textDim }}>
          {it.description}
        </span>
        {done ? (
          <span style={{ font: chakra(700, 11), letterSpacing: '0.1em', color: C.gold }}>UNLOCKED · {shortDate(it.unlockedAt!).toUpperCase()}</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Bar fraction={it.current / it.target} />
            </div>
            <span style={{ font: chakra(700, 11), color: C.textMuted }}>
              {it.current}/{it.target}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TrophyDetail({ it, onClose }: { it: Item; onClose: () => void }) {
  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (e.action === 'back' || e.action === 'confirm') onClose();
    },
  });
  const done = !!it.unlockedAt;
  return (
    <Dialog title={it.def.name.toUpperCase()} width={520} prompts={[{ glyphs: ['B'], label: 'Close' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Hex w={84} h={76} fill={done ? C.gold : C.goldBorder} {...(done ? {} : { outline: { w: 76, h: 68 } })}>
          <TrophyGlyph icon={it.def.icon} size={34} color={done ? C.goldOn : C.gold} />
        </Hex>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Eyebrow size={12} color={done ? C.gold : C.textMuted}>
            {done ? `UNLOCKED · ${shortDate(it.unlockedAt!).toUpperCase()}` : 'LOCKED'}
          </Eyebrow>
          <span style={{ fontSize: 16, color: C.textSecondary }}>{it.description}</span>
          {it.bookTitle ? <span style={{ fontSize: 13, color: C.textDim }}>{it.bookTitle}</span> : null}
          {!done ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div style={{ flex: 1 }}>
                <Bar fraction={it.current / it.target} height={6} />
              </div>
              <span style={{ font: chakra(700, 13), color: C.textPrimary }}>
                {it.current} / {it.target}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
