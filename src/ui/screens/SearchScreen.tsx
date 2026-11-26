// Search (spec §7.8): a text field and the in-app keyboard; results update
// live with a fuzzy match on title, author and file name. With an empty
// query the row shows recently read books.

import { useMemo, useRef, useState } from 'react';
import { searchBooks } from '../../core/search';
import { KEYS, keyboardGraph } from '../../core/input/keyboardLayout';
import { mergeGraphs, rowGraph } from '../../core/input/focus';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useNav } from '../nav';
import { useBookViews } from '../store';
import { C, chakra } from '../tokens';
import { BreadcrumbHeader } from '../components/Header';
import { PromptBar, type Prompt } from '../components/Glyph';
import { Cover } from '../components/Cover';
import { Bar, Eyebrow } from '../components/Game';
import { GRID_W, KeyGrid, TextField, useTextEntry } from '../components/Keyboard';

const MAX_RESULTS = 40;
const COVER_W = 120;
const COVER_GAP = 16;
const VISIBLE = 8;

// Kept for the session so coming back from a book shows the same results.
let lastQuery = '';

export function SearchScreen() {
  const nav = useNav();
  const views = useBookViews();
  const t = useTextEntry(lastQuery, 60, { autoCapitalise: false });
  lastQuery = t.s.text;

  const results = useMemo(() => {
    if (!t.s.text.trim()) {
      return [...views]
        .filter((v) => v.book.available)
        .sort((a, b) => (b.book.lastOpenedAt ?? 0) - (a.book.lastOpenedAt ?? 0) || b.book.addedAt - a.book.addedAt)
        .slice(0, 12);
    }
    const byId = new Map(views.map((v) => [v.book.id, v]));
    const docs = views.map((v) => ({ id: v.book.id, title: v.book.title, ...(v.book.author ? { author: v.book.author } : {}), file: v.book.path.split(/[\\/]/).pop() ?? '' }));
    return searchBooks(t.s.text, docs)
      .slice(0, MAX_RESULTS)
      .map((h) => byId.get(h.id)!)
      .filter(Boolean);
  }, [t.s.text, views]);

  const resultIds = useMemo(() => results.map((v) => `r:${v.book.id}`), [results]);
  const graph = useMemo(() => mergeGraphs(keyboardGraph(), rowGraph(resultIds)), [resultIds]);
  const { focused, setFocused, navigate } = useFocus('search', graph, 'k:1:0');
  const lastKey = useRef('k:1:0');
  const lastResult = useRef(0);
  const inKeys = focused.startsWith('k:');
  if (inKeys) lastKey.current = focused;
  else lastResult.current = Math.max(0, resultIds.indexOf(focused));
  const focusedBook = !inKeys ? focused.slice(2) : undefined;

  const toResults = () => {
    if (resultIds.length) setFocused(resultIds[Math.min(lastResult.current, resultIds.length - 1)]!);
  };

  useInput({
    context: 'overlay',
    onAction: (e) => {
      // Between the keyboard and the results row.
      if (inKeys && e.action === 'nav_up' && focused.startsWith('k:0:')) return toResults();
      if (!inKeys && e.action === 'nav_down') return setFocused(lastKey.current);
      if (navigate(e.action)) return;
      if (inKeys) {
        switch (e.action) {
          case 'confirm': {
            const k = KEYS[focused];
            if (k && t.press(k) === 'done') toResults();
            return;
          }
          case 'secondary':
            return t.erase();
          case 'tertiary':
            return t.type(' ');
          case 'tab_prev':
            return t.cursor(-1);
          case 'tab_next':
            return t.cursor(1);
          case 'menu':
            return toResults();
          case 'back':
            return nav.pop();
        }
      } else {
        switch (e.action) {
          case 'confirm':
            if (focusedBook) nav.openBook(focusedBook);
            return;
          case 'secondary':
            if (focusedBook) nav.openDetails(focusedBook);
            return;
          case 'back':
          case 'menu':
            return setFocused(lastKey.current);
        }
      }
    },
    // Typing on a keyboard always edits the query, even from the results row.
    onText: (x) => {
      if (!inKeys) setFocused(lastKey.current);
      if (typeof x === 'string') return t.type(x);
      if (x.key === 'backspace') return t.erase();
      if (x.key === 'enter') return toResults();
    },
  });

  const idx = Math.max(0, resultIds.indexOf(focused));
  const first = inKeys ? 0 : Math.max(0, Math.min(results.length - VISIBLE, idx - (VISIBLE - 2)));
  const label = t.s.text.trim() ? `${results.length === MAX_RESULTS ? `${MAX_RESULTS}+` : results.length} ${results.length === 1 ? 'match' : 'matches'}` : 'Recent';

  const prompts: Prompt[] = inKeys
    ? [
        { glyphs: ['A'], label: 'Type' },
        { glyphs: ['X'], label: 'Delete' },
        { glyphs: ['Y'], label: 'Space' },
        { glyphs: ['L1', 'R1'], label: 'Cursor' },
        { glyphs: ['Menu'], label: 'Results' },
        { glyphs: ['B'], label: 'Back' },
      ]
    : [
        { glyphs: ['A'], label: 'Open' },
        { glyphs: ['X'], label: 'Stage map' },
        { glyphs: ['Dpad'], label: 'Move' },
        { glyphs: ['B'], label: 'Keyboard' },
      ];

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: C.bgBase }}>
      <BreadcrumbHeader trail={['Home', 'Search']} />
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '20px 40px 0' }}>
        <div style={{ width: GRID_W, display: 'flex', alignItems: 'center', gap: 16 }}>
          <TextField s={t.s} placeholder="Title, author or file name" width={GRID_W} />
        </div>
        <section aria-label="Results" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <Eyebrow size={12} color={t.s.text.trim() ? C.cyan : C.textDim}>
              {label.toUpperCase()}
            </Eyebrow>
            {!inKeys ? null : results.length ? <span style={{ fontSize: 12, color: C.textDim }}>D-pad up from the top row to pick one</span> : null}
          </div>
          {/* Cover + bar + title, plus room for the focus ring and lift. */}
          <div style={{ position: 'relative', height: 14 + 168 + 8 + 3 + 8 + 18, margin: '-14px -14px 0', padding: '14px 14px 0', overflow: 'hidden' }}>
            {results.length ? (
              <div style={{ display: 'flex', gap: COVER_GAP, transform: `translateX(${-first * (COVER_W + COVER_GAP)}px)`, transition: 'transform 160ms ease-out' }}>
                {results.map((v) => {
                  const f = focused === `r:${v.book.id}`;
                  return (
                    <div key={v.book.id} style={{ width: COVER_W, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Cover book={v.book} width={COVER_W} height={168} radius={8} focused={f} isNew={v.book.lastOpenedAt === undefined} cleared={v.cleared} />
                      <Bar fraction={v.progress} color={f ? C.cyan : C.gold} height={3} />
                      <span className="ellipsis" style={{ fontSize: 12, color: f ? C.textPrimary : C.textMuted, fontWeight: f ? 600 : 400 }}>
                        {v.book.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ paddingTop: 50, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ font: chakra(600, 18) }}>No matches</span>
                <span style={{ fontSize: 14, color: C.textMuted }}>Try fewer letters, or search by author or file name.</span>
              </div>
            )}
          </div>
        </section>
        <KeyGrid focused={inKeys ? focused : null} upper={t.upper} doneLabel="RESULTS" />
      </main>
      <PromptBar prompts={prompts} />
    </div>
  );
}
