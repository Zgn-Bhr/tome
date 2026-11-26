// Home (§7.1, artboard Main): Continue hero, daily quest, next trophy, and
// the Recently added shelf.

import { useEffect, useMemo, useRef } from 'react';
import { continueCandidate, sortViews, startCandidate, type BookView } from '../../core/library';
import { link, mergeGraphs, rowGraph, type FocusGraph } from '../../core/input/focus';
import { stageForPage, stageTitle } from '../../core/stages/derive';
import { formatDuration, relativeDay } from '../../core/time';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useNav } from '../nav';
import { useApp, useBookGame, useBookViews } from '../store';
import { useGame } from '../game';
import { C, chakra } from '../tokens';
import { Button, PromptBar, type Prompt } from '../components/Glyph';
import { Bar, Eyebrow, Hex, Ring, SegmentedProgress, WeekDots, stageSegments } from '../components/Game';
import { Cover } from '../components/Cover';
import { CalendarCheck, Check, Flame, Trophy } from '../components/Icons';
import type { TabProps } from './LibraryScreen';

const SHELF = 7;

export function HomeTab({ cycleTab, goTab }: TabProps) {
  const views = useBookViews();
  const nav = useNav();
  const indexing = useApp((s) => s.indexing);
  const scanning = useApp((s) => s.scanning);

  const continuing = continueCandidate(views);
  const hero: BookView | undefined = continuing ?? startCandidate(views) ?? sortViews(views, 'last_read')[0];
  // A cleared book can still be the hero when nothing else is in progress or unread.
  const mode: HeroMode = continuing ? 'continue' : hero?.cleared ? 'again' : 'start';
  const shelf = useMemo(() => sortViews(views, 'recently_added').slice(0, SHELF), [views]);

  const graph = useMemo(() => {
    const covers = shelf.map((v) => `c:${v.book.id}`);
    let g: FocusGraph = mergeGraphs(hero ? { hero: { right: 'quest' } } : {}, { quest: { down: 'trophy', ...(hero ? { left: 'hero' } : {}) } }, { trophy: { up: 'quest', ...(hero ? { left: 'hero' } : {}) } }, rowGraph(covers));
    if (covers.length) {
      if (hero) g = link(g, 'hero', 'down', covers[0]!);
      g = link(g, 'trophy', 'down', covers[Math.min(5, covers.length - 1)]!);
      for (const c of covers) g = link(g, c, 'up', hero ? 'hero' : 'quest');
    }
    return g;
  }, [shelf, hero]);

  const { focused, setFocused, navigate } = useFocus('home', graph, hero ? 'hero' : 'quest');
  const focusedBook = focused === 'hero' ? hero?.book.id : focused.startsWith('c:') ? focused.slice(2) : undefined;

  // The hero has focus at launch (§7.1), even if the library loaded after first paint.
  const userMoved = useRef(false);
  const hasHero = !!hero;
  useEffect(() => {
    if (hasHero && !userMoved.current && focused !== 'hero') setFocused('hero');
  }, [hasHero, focused, setFocused]);

  useInput({
    context: 'library',
    onAction: (e) => {
      userMoved.current = true;
      if (navigate(e.action)) return;
      switch (e.action) {
        case 'tab_prev':
          return cycleTab(-1);
        case 'tab_next':
          return cycleTab(1);
        case 'filter_next':
          return goTab('library');
        case 'confirm':
          if (focusedBook) nav.openBook(focusedBook);
          else goTab('trophies');
          return;
        case 'secondary':
          if (focusedBook) nav.openDetails(focusedBook);
          return;
        case 'tertiary':
          return nav.push({ name: 'search' });
        case 'view':
          return goTab('library', { openSort: true });
        case 'menu':
          return nav.showSettings();
        case 'back':
          return nav.showQuit();
      }
    },
  });

  const prompts: Prompt[] = focusedBook
    ? [
        { glyphs: ['A'], label: focused === 'hero' && mode === 'continue' ? 'Resume' : 'Open' },
        { glyphs: ['X'], label: 'Stage map' },
        { glyphs: ['Y'], label: 'Search' },
        { glyphs: ['View'], label: 'Sort' },
        { glyphs: ['Menu'], label: 'Settings' },
        { glyphs: ['B'], label: 'Quit' },
      ]
    : [
        { glyphs: ['A'], label: 'Trophies' },
        { glyphs: ['Y'], label: 'Search' },
        { glyphs: ['Menu'], label: 'Settings' },
        { glyphs: ['B'], label: 'Quit' },
      ];

  const status = scanning ? 'Scanning folders…' : indexing ? `Preparing covers · ${indexing.done} / ${indexing.total}` : null;

  return (
    <>
      <main style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', gap: 30, padding: '28px 40px 0', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 24, height: 300, flex: 'none' }}>
          {hero ? <Hero view={hero} mode={mode} focused={focused === 'hero'} /> : <EmptyHero />}
          <div style={{ width: 372, flex: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <QuestCard focused={focused === 'quest'} />
            <TrophyCard focused={focused === 'trophy'} />
          </div>
        </div>
        <section aria-label="Recently added" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, font: chakra(600, 18), letterSpacing: '0.08em' }}>RECENTLY ADDED</h2>
            <span style={{ fontSize: 13, color: C.textDim }}>
              {shelf.length} of {views.length} · <span style={{ color: C.textMuted }}>R2</span> all books
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {shelf.map((v) => (
              <div key={v.book.id} style={{ width: 148, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Cover book={v.book} height={208} focused={focused === `c:${v.book.id}`} isNew={v.book.lastOpenedAt === undefined} cleared={v.cleared} />
                <Bar fraction={v.progress} />
              </div>
            ))}
          </div>
        </section>
      </main>
      <PromptBar prompts={prompts} left={status} />
    </>
  );
}

type HeroMode = 'continue' | 'start' | 'again';

function Hero({ view, mode, focused }: { view: BookView; mode: HeroMode; focused: boolean }) {
  const stages = useApp((s) => s.stages[view.book.id]) ?? [];
  const bookmarks = useApp((s) => s.bookmarks[view.book.id]);
  const bookGame = useBookGame(view.book.id);
  const { book, state, stats } = view;
  const page = state?.page ?? 1;
  const stage = stageForPage(stages, page);
  const pct = Math.floor(view.progress * 100);
  const meta =
    mode !== 'start'
      ? [
          stats ? `${formatDuration(stats.activeMs)} read` : null,
          stats?.lastSessionAt ? `last session ${relativeDay(stats.lastSessionAt, Date.now())}` : null,
          `${bookmarks?.length ?? 0} bookmark${bookmarks?.length === 1 ? '' : 's'}`,
        ]
      : [book.pageCount ? `${book.pageCount} pages` : null, `added ${relativeDay(book.addedAt, Date.now())}`];
  return (
    <section
      aria-label="Continue reading"
      className={`focusable${focused ? ' is-focused' : ''}`}
      style={{ flex: 1, minWidth: 0, display: 'flex', gap: 28, padding: 22, borderRadius: 20, background: C.surface1, border: `1px solid ${C.line3}` }}
    >
      <Cover book={book} width={180} height={254} lift={false} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Eyebrow color={mode === 'again' ? C.gold : C.cyan}>{mode === 'continue' ? 'CONTINUE READING' : mode === 'again' ? 'CLEARED · READ AGAIN' : 'START READING'}</Eyebrow>
        <h1 className="clamp2" style={{ margin: '10px 0 0', font: chakra(600, 32, 1.1), color: C.textPrimary }}>
          {book.title}
        </h1>
        {book.author ? <span style={{ marginTop: 6, fontSize: 16, color: C.textMuted }}>{book.author}</span> : null}
        <span style={{ marginTop: 12, fontSize: 14, color: C.textDim }}>{meta.filter(Boolean).join(' · ')}</span>
        <div style={{ flex: 1 }} />
        {stages.length && stage ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, color: C.textMuted, gap: 12 }}>
              <span className="ellipsis">
                <span style={{ font: chakra(600, 13), color: C.textPrimary, letterSpacing: '0.06em' }}>
                  STAGE {stage.index + 1}/{stages.length}
                </span>{' '}
                · {stageTitle(stage)}
              </span>
              <span style={{ flex: 'none' }}>
                p. {page} / {book.pageCount} · {pct}%
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <SegmentedProgress segments={stageSegments(stages, mode === 'start' ? 0 : page, bookGame.clearedStages)} />
            </div>
          </>
        ) : (
          <span style={{ fontSize: 13, color: C.textDim }}>Reading the outline…</span>
        )}
        <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
          <Button glyph="A" label={mode === 'continue' ? 'RESUME' : mode === 'again' ? 'OPEN' : 'START'} />
          <Button glyph="X" label="STAGE MAP" kind="secondary" />
        </div>
      </div>
    </section>
  );
}

function EmptyHero() {
  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: 32, borderRadius: 20, background: C.surface1, border: `1px solid ${C.line3}` }}>
      <Eyebrow>NO BOOKS YET</Eyebrow>
      <span style={{ font: chakra(600, 26) }}>Add a folder with PDFs</span>
      <span style={{ fontSize: 14, color: C.textMuted }}>Press Menu, then Library folders.</span>
    </section>
  );
}

function QuestCard({ focused }: { focused: boolean }) {
  const g = useGame();
  const done = g.pagesToday >= g.dailyGoal;
  return (
    <section
      aria-label="Daily quest"
      className={`focusable${focused ? ' is-focused' : ''}`}
      style={{ flex: 1, borderRadius: 18, background: C.surface1, border: `1px solid ${C.line2}`, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Ring value={Math.min(g.pagesToday, g.dailyGoal)} max={g.dailyGoal} label={`${g.pagesToday} of ${g.dailyGoal} pages read today`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Eyebrow color={C.gold} size={12}>
            DAILY QUEST
          </Eyebrow>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Read {g.dailyGoal} pages</span>
          <span style={{ fontSize: 13, color: C.textMuted }}>
            {done ? `Done${g.showXp ? ' · +50 XP' : ''}` : `${g.pagesToday} / ${g.dailyGoal}${g.showXp ? ' · +50 XP when done' : ''}`}
          </span>
        </div>
      </div>
      {g.showStreak ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <WeekDots states={g.week} />
          <span style={{ fontSize: 12, color: C.textDim, whiteSpace: 'nowrap' }}>
            {g.streak.todayPending ? (g.streak.current ? 'Read today to keep it' : 'Start a streak today') : 'Streak kept today'}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function TrophyCard({ focused }: { focused: boolean }) {
  const g = useGame();
  const next = g.next;
  const Icon = next?.trophy.icon === 'calendar' ? CalendarCheck : next?.trophy.icon === 'flame' ? Flame : next?.trophy.icon === 'check' ? Check : Trophy;
  return (
    <section
      aria-label="Next trophy"
      className={`focusable${focused ? ' is-focused' : ''}`}
      style={{ flex: 1, borderRadius: 18, background: C.surface1, border: `1px solid ${C.line2}`, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Hex w={60} h={54} fill={C.goldBorder} outline={{ w: 52, h: 46 }}>
          <Icon size={22} color={C.gold} stroke={2} />
        </Hex>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Eyebrow color={C.gold} size={12}>
            NEXT TROPHY
          </Eyebrow>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{next?.trophy.name ?? 'All trophies earned'}</span>
          <span style={{ fontSize: 13, color: C.textMuted }}>{next?.trophy.description ?? 'Nothing left to unlock'}</span>
        </div>
      </div>
      {next ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {next.target <= 10 ? (
              <SegmentedProgress segments={Array.from({ length: next.target }, (_, i) => (i < next.current ? { kind: 'cleared' } : { kind: 'future' }))} height={8} radius={2} />
            ) : (
              <Bar fraction={next.current / next.target} height={8} />
            )}
          </div>
          <span style={{ font: chakra(700, 14), color: C.textPrimary }}>
            {next.current}/{next.target}
          </span>
        </div>
      ) : null}
    </section>
  );
}
