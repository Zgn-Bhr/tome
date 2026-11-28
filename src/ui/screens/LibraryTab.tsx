// Library — all books (§7.2, artboard LibraryGrid).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_FILTER_HINTS,
  SORTS,
  SORT_LABELS,
  filterCounts,
  matchesFilter,
  sortViews,
  visibleFilters,
  type BookView,
  type LibraryFilter,
  type LibrarySort,
} from '../../core/library';
import { columnGraph, gridGraph } from '../../core/input/focus';
import { stageForPage, stageTitle } from '../../core/stages/derive';
import { compactSince, formatDuration } from '../../core/time';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useNav } from '../nav';
import { useApp, useBookGame, useBookViews } from '../store';
import { C, FONT, chakra } from '../tokens';
import { Button, Glyph, PromptBar } from '../components/Glyph';
import { Bar, Eyebrow, SegmentedProgress, StatTile, stageSegments } from '../components/Game';
import { Cover } from '../components/Cover';
import { TwoColumn } from '../components/Icons';
import { Dialog, MenuList } from '../components/Overlay';
import type { TabProps } from './LibraryScreen';

const COLS = 5;
const ROW_PITCH = 200 + 8 + 16 + 8 + 4 + 26; // cover + gap + title + gap + bar + row gap
const GRID_VIEW_H = 800 - 76 - 60 - 24 - 36 - 22;

// Per-session memory of filter and sort, like focus.
let lastFilter: LibraryFilter = 'all';
let lastSort: LibrarySort = 'last_read';

export function LibraryTab({ cycleTab, goTab, openSort }: TabProps & { openSort: boolean }) {
  const views = useBookViews();
  const nav = useNav();
  const [filter, setFilter] = useState<LibraryFilter>(lastFilter);
  const [sort, setSort] = useState<LibrarySort>(lastSort);
  const [sortOpen, setSortOpen] = useState(openSort);
  useEffect(() => {
    lastFilter = filter;
    lastSort = sort;
  }, [filter, sort]);

  const counts = useMemo(() => filterCounts(views), [views]);
  const filters = useMemo(() => visibleFilters(counts), [counts]);
  // The Manuals chip goes away when manuals are turned off; fall back to All.
  useEffect(() => {
    if (!filters.includes(filter)) setFilter('all');
  }, [filters, filter]);
  const shown = useMemo(() => sortViews(views.filter((v) => matchesFilter(v, filter)), sort), [views, filter, sort]);
  const ids = useMemo(() => shown.map((v) => v.book.id), [shown]);
  const graph = useMemo(() => gridGraph(ids, COLS), [ids]);
  const { focused, setFocused, navigate } = useFocus(`library:${filter}`, graph, ids[0]);
  const focusedView = shown.find((v) => v.book.id === focused);

  const changeFilter = (d: -1 | 1) => {
    const i = filters.indexOf(filter);
    const next = filters[Math.min(filters.length - 1, Math.max(0, i + d))]!;
    if (next !== filter) setFilter(next);
  };

  useInput(
    {
      context: 'library',
      onAction: (e) => {
        if (navigate(e.action)) return;
        switch (e.action) {
          case 'tab_prev':
            return cycleTab(-1);
          case 'tab_next':
            return cycleTab(1);
          case 'filter_prev':
            return changeFilter(-1);
          case 'filter_next':
            return changeFilter(1);
          case 'confirm':
            if (focusedView) nav.openBook(focusedView.book.id);
            return;
          case 'secondary':
            if (focusedView) nav.openDetails(focusedView.book.id);
            return;
          case 'tertiary':
            return nav.push({ name: 'search' });
          case 'view':
            return setSortOpen(true);
          case 'menu':
            return nav.showSettings();
          case 'back':
            return goTab('home');
        }
      },
    },
    !sortOpen,
  );

  // Keep the focused row plus one row of look-ahead visible (§6.6).
  const row = Math.max(0, ids.indexOf(focused)) / COLS;
  const focusRow = Math.floor(row);
  const rows = Math.ceil(ids.length / COLS);
  const offset = useRef(0);
  const wantBottom = (Math.min(rows - 1, focusRow + 1) + 1) * ROW_PITCH - 26;
  let next = offset.current;
  if (wantBottom - next > GRID_VIEW_H) next = wantBottom - GRID_VIEW_H;
  if (focusRow * ROW_PITCH < next) next = focusRow * ROW_PITCH;
  offset.current = Math.max(0, next);

  return (
    <>
      <main style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 22, padding: '24px 40px 0' }}>
        {/* Filters and sort run across the whole width: six chips don't fit beside the panel. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Glyph name="L2" />
            {filters.map((f) => (
              <Chip key={f} active={f === filter} label={`${f.toUpperCase()} ${counts[f]}`} />
            ))}
            <Glyph name="R2" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textMuted, whiteSpace: 'nowrap' }}>
            <Glyph name="View" size={24} />
            <span>
              Sort: <span style={{ color: C.textPrimary, fontWeight: 600 }}>{SORT_LABELS[sort]}</span>
            </span>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 32 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', margin: '-8px -8px 0', padding: '8px 8px 0' }}>
            {shown.length === 0 ? (
              <div style={{ paddingTop: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                <span style={{ font: chakra(600, 22) }}>Nothing here yet</span>
                <span style={{ fontSize: 14, color: C.textMuted }}>{EMPTY_FILTER_HINTS[filter]}</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                  columnGap: 22,
                  rowGap: 26,
                  transform: `translateY(${-offset.current}px)`,
                  transition: 'transform 160ms ease-out',
                }}
              >
                {shown.map((v) => (
                  <GridItem key={v.book.id} v={v} focused={v.book.id === focused} onPick={() => setFocused(v.book.id)} />
                ))}
              </div>
            )}
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, background: `linear-gradient(rgba(13,17,32,0), ${C.bgBase})`, pointerEvents: 'none' }} />
          </div>
          {focusedView ? <SelectedPanel v={focusedView} /> : <div style={{ width: 340, flex: 'none' }} />}
        </div>
      </main>
      <PromptBar
        prompts={[
          { glyphs: ['A'], label: 'Open' },
          { glyphs: ['X'], label: 'Stage map' },
          { glyphs: ['Y'], label: 'Search' },
          { glyphs: ['L2', 'R2'], label: 'Filter' },
          { glyphs: ['View'], label: 'Sort' },
          { glyphs: ['B'], label: 'Home' },
        ]}
      />
      {sortOpen ? <SortMenu current={sort} onPick={(s) => (setSort(s), setSortOpen(false))} onClose={() => setSortOpen(false)} /> : null}
    </>
  );
}

function Chip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      style={{
        height: 36,
        padding: '0 14px',
        display: 'inline-flex',
        alignItems: 'center',
        flex: 'none',
        whiteSpace: 'nowrap',
        border: active ? 0 : `1px solid ${C.line4}`,
        borderRadius: 18,
        background: active ? C.gold : C.surface1,
        color: active ? C.goldOn : C.textSecondary,
        font: chakra(active ? 700 : 600, 13),
        letterSpacing: '0.08em',
      }}
    >
      {label}
    </span>
  );
}

function GridItem({ v, focused, onPick }: { v: BookView; focused: boolean; onPick: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }} onPointerDown={onPick}>
      <Cover book={v.book} height={200} focused={focused} isNew={v.book.lastOpenedAt === undefined} cleared={v.cleared} />
      <span className="ellipsis" style={{ fontSize: 13, color: focused ? C.textPrimary : C.textMuted, fontWeight: focused ? 600 : 400 }}>
        {v.book.title}
      </span>
      <Bar fraction={v.progress} color={focused ? C.cyan : C.gold} />
    </div>
  );
}

function SelectedPanel({ v }: { v: BookView }) {
  const stages = useApp((s) => s.stages[v.book.id]) ?? [];
  const bookmarks = useApp((s) => s.bookmarks[v.book.id]);
  const bookGame = useBookGame(v.book.id);
  const { book, state, stats } = v;
  const page = state?.page ?? 1;
  const stage = stageForPage(stages, page);
  const opened = book.lastOpenedAt !== undefined;
  const file = book.path.split(/[\\/]/).pop();
  return (
    <aside
      aria-label="Selected book"
      style={{ position: 'relative', width: 340, flex: 'none', marginBottom: 24, borderRadius: 20, background: C.surface1, border: `1px solid ${C.line3}`, padding: 24, display: 'flex', flexDirection: 'column' }}
    >
      <Eyebrow size={12}>
        {book.kind === 'manual' ? `MANUAL · ${(book.author ?? '').toUpperCase()}` : book.kind.toUpperCase()} · {book.pageCount ? `${book.pageCount} PAGES` : 'READING…'}
      </Eyebrow>
      <h2 className="clamp2" style={{ margin: '12px 0 0', font: chakra(600, 24, 1.15) }}>
        {book.title}
      </h2>
      <span className="ellipsis" style={{ marginTop: 8, font: `400 13px/1.3 ${FONT.mono}`, color: C.textDim }}>
        {file}
      </span>
      {stage ? (
        <>
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.textMuted, gap: 10 }}>
            <span className="ellipsis">
              <span style={{ font: chakra(600, 13), color: C.textPrimary, letterSpacing: '0.06em' }}>
                STAGE {opened ? stage.index + 1 : 1}/{stages.length}
              </span>{' '}
              · {stageTitle(opened ? stage : stages[0]!)}
            </span>
            <span style={{ flex: 'none' }}>
              p. {opened ? page : 1} / {book.pageCount}
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <SegmentedProgress segments={stageSegments(stages, opened ? page : 0, bookGame.clearedStages)} />
          </div>
        </>
      ) : null}
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <StatTile value={stats ? formatDuration(stats.activeMs, 'short') : '0m'} label="time read" />
        <StatTile value={String(bookmarks?.length ?? 0)} label="bookmarks" />
        <StatTile value={stats?.lastSessionAt ? compactSince(stats.lastSessionAt, Date.now()) : '—'} label="since last read" />
      </div>
      {book.isTwoColumn ? (
        <div style={{ marginTop: 22, padding: 14, borderRadius: 14, background: C.surfaceInset, border: `1px solid ${C.line2}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <TwoColumn />
          <span style={{ fontSize: 13, lineHeight: 1.45, color: C.textSecondary }}>
            Two-column layout detected. Opens in <span style={{ color: C.textPrimary, fontWeight: 600 }}>Column mode</span>: scroll down one column, then jump to the top of the
            next.
          </span>
        </div>
      ) : null}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <Button glyph="A" label={opened ? 'CONTINUE' : 'START'} grow size={15} />
        <Button glyph="X" label="MAP" kind="secondary" size={15} />
      </div>
    </aside>
  );
}

function SortMenu({ current, onPick, onClose }: { current: LibrarySort; onPick: (s: LibrarySort) => void; onClose: () => void }) {
  const graph = useMemo(() => columnGraph(SORTS), []);
  const { focused, navigate } = useFocus('sort-menu', graph, current);
  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (navigate(e.action)) return;
      if (e.action === 'confirm') onPick(focused as LibrarySort);
      if (e.action === 'back' || e.action === 'view') onClose();
    },
  });
  return (
    <Dialog
      title="SORT BY"
      width={420}
      prompts={[
        { glyphs: ['A'], label: 'Choose' },
        { glyphs: ['B'], label: 'Close' },
      ]}
    >
      <MenuList rows={SORTS.map((s) => ({ id: s, label: SORT_LABELS[s], ...(s === current ? { value: 'CURRENT', tag: true } : {}) }))} focused={focused} />
    </Dialog>
  );
}
