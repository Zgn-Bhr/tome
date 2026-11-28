// Collections tab (spec §7.8, not designed — kept in the same system as Home's
// shelf): one row of covers per collection. Smart collections (Papers, Books,
// and "Game manuals · <system>" for ES-DE manuals) are read-only. X on a book
// adds it to a collection; Menu on a shelf renames or deletes it.

import { useMemo, useState } from 'react';
import type { Collection } from '../../core/models';
import { cleanName, isSmart, smartCollections, visibleBooks } from '../../core/collections';
import { columnGraph, type FocusGraph } from '../../core/input/focus';
import { createCollection, deleteCollection, renameCollection, toggleInCollection } from '../actions';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useNav } from '../nav';
import { useApp, useBookViews } from '../store';
import { C, chakra } from '../tokens';
import { Glyph, PromptBar, type Prompt } from '../components/Glyph';
import { Bar, Eyebrow } from '../components/Game';
import { Cover } from '../components/Cover';
import { Dialog, MenuList, Sheet, type MenuRow } from '../components/Overlay';
import { Keyboard } from '../components/Keyboard';
import { useToast } from '../components/Toast';
import type { TabProps } from './LibraryScreen';

const COVER_W = 148;
const COVER_GAP = 20;
const SHELF_PITCH = 18 + 14 + 208 + 10 + 4 + 30;
const VISIBLE_COVERS = 7;
const VIEW_H = 800 - 76 - 60 - 28;

interface Shelf {
  c: Collection;
  ids: string[];
}

type Overlay =
  | null
  | { kind: 'add'; bookId: string }
  | { kind: 'menu'; shelf: Shelf }
  | { kind: 'confirmDelete'; c: Collection }
  | { kind: 'keyboard'; mode: 'create' | 'rename'; c?: Collection; withBook?: string; back: Overlay };

const nameError = (t: string) => (cleanName(t) ? null : 'Type a name first');

export function CollectionsTab({ cycleTab, goTab }: TabProps) {
  const nav = useNav();
  const toast = useToast();
  const views = useBookViews();
  const user = useApp((s) => s.collections);
  const [overlay, setOverlay] = useState<Overlay>(null);

  const byId = useMemo(() => new Map(views.map((v) => [v.book.id, v])), [views]);
  const shelves: Shelf[] = useMemo(() => {
    const known = new Set(byId.keys());
    const smart = smartCollections(views.map((v) => v.book)).filter((c) => c.bookIds.length > 0);
    return [...user, ...smart].map((c) => ({ c, ids: visibleBooks(c, known) }));
  }, [user, views, byId]);

  // Focus ids name the collection and book ("b|<collection>|<book>", "e|<collection>"
  // for an empty shelf, "new" for the button), so focus survives shelves being added.
  const graph = useMemo(() => {
    const g: FocusGraph = {};
    const rowIds = shelves.map((sh) => (sh.ids.length ? sh.ids.map((b) => bookKey(sh.c.id, b)) : [emptyKey(sh.c.id)]));
    rowIds.forEach((ids, i) => {
      ids.forEach((id, j) => {
        const above = rowIds[i - 1];
        const below = rowIds[i + 1];
        g[id] = {
          ...(j > 0 ? { left: ids[j - 1]! } : {}),
          ...(j < ids.length - 1 ? { right: ids[j + 1]! } : {}),
          ...(above ? { up: above[Math.min(j, above.length - 1)]! } : {}),
          ...(below ? { down: below[Math.min(j, below.length - 1)]! } : { down: 'new' }),
        };
      });
    });
    const last = rowIds[rowIds.length - 1];
    g.new = last ? { up: last[0]! } : {};
    return { graph: g, first: rowIds[0]?.[0] ?? 'new' };
  }, [shelves]);

  const { focused, setFocused, navigate } = useFocus('collections', graph.graph, graph.first);
  const [kind, cid, bid] = focused.split('|');
  const shelfIdx = focused === 'new' ? -1 : shelves.findIndex((s) => s.c.id === cid);
  const shelf = shelves[shelfIdx];
  const bookId = kind === 'b' ? bid : undefined;

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
          case 'confirm':
            if (focused === 'new') return setOverlay({ kind: 'keyboard', mode: 'create', back: null });
            if (bookId) nav.openBook(bookId);
            return;
          case 'secondary':
            if (bookId) setOverlay({ kind: 'add', bookId });
            return;
          case 'tertiary':
            return nav.push({ name: 'search' });
          case 'menu':
            if (shelf) return setOverlay({ kind: 'menu', shelf });
            return nav.showSettings();
          case 'back':
            return goTab('home');
        }
      },
    },
    overlay === null,
  );

  // Keep the focused shelf in view (with the next one peeking in), and the focused cover in its row.
  const totalH = shelves.length * SHELF_PITCH + 60;
  const offsetY = Math.max(0, Math.min(Math.max(0, totalH - VIEW_H), (shelfIdx < 0 ? shelves.length : shelfIdx) * SHELF_PITCH - (shelfIdx > 0 ? 40 : 0)));

  const prompts: Prompt[] =
    focused === 'new'
      ? [
          { glyphs: ['A'], label: 'New collection' },
          { glyphs: ['L1', 'R1'], label: 'Tabs' },
          { glyphs: ['Menu'], label: 'Settings' },
          { glyphs: ['B'], label: 'Home' },
        ]
      : [
          ...(bookId
            ? [
                { glyphs: ['A' as const], label: 'Open' },
                { glyphs: ['X' as const], label: 'Add to collection' },
              ]
            : []),
          { glyphs: ['Y'], label: 'Search' },
          { glyphs: ['Menu'], label: shelf && !isSmart(shelf.c) ? 'Rename / delete' : 'Collection' },
          { glyphs: ['B'], label: 'Home' },
        ];

  const closeKeyboard = (o: Extract<Overlay, { kind: 'keyboard' }>) => setOverlay(o.back);

  return (
    <>
      <main style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', padding: '28px 40px 0' }}>
        <div style={{ transform: `translateY(${-offsetY}px)`, transition: 'transform 180ms ease-out', display: 'flex', flexDirection: 'column', gap: 30 }}>
          {!user.length ? (
            <div style={{ padding: '18px 22px', borderRadius: 18, background: C.surface1, border: `1px solid ${C.line2}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Eyebrow size={12}>YOUR SHELVES</Eyebrow>
              <span style={{ fontSize: 15, color: C.textSecondary }}>
                Press <Glyph name="X" size={22} /> on any book to put it in a collection, or make an empty one at the bottom of this page.
              </span>
            </div>
          ) : null}
          {shelves.map((sh) => (
            <ShelfRow key={sh.c.id} sh={sh} focused={focused} byId={byId} onPick={setFocused} />
          ))}
          <div
            className={`focusable${focused === 'new' ? ' is-focused' : ''}`}
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 46,
              padding: '0 22px 0 9px',
              borderRadius: 23,
              border: `1px solid ${C.glyphRing}`,
              background: C.surfaceButton2,
              font: chakra(700, 15),
              letterSpacing: '0.06em',
              marginBottom: 40,
            }}
          >
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: C.glyphRing, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: chakra(700, 18) }}>+</span>
            NEW COLLECTION
          </div>
        </div>
      </main>
      <PromptBar prompts={prompts} />

      {overlay?.kind === 'add' ? (
        <AddToCollection
          bookId={overlay.bookId}
          title={byId.get(overlay.bookId)?.book.title ?? ''}
          onNew={() => setOverlay({ kind: 'keyboard', mode: 'create', withBook: overlay.bookId, back: overlay })}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.kind === 'menu' ? (
        <CollectionMenu
          shelf={overlay.shelf}
          onRename={() => setOverlay({ kind: 'keyboard', mode: 'rename', c: overlay.shelf.c, back: null })}
          onDelete={() => setOverlay({ kind: 'confirmDelete', c: overlay.shelf.c })}
          onNew={() => setOverlay({ kind: 'keyboard', mode: 'create', back: null })}
          onSettings={() => {
            setOverlay(null);
            nav.showSettings();
          }}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.kind === 'confirmDelete' ? (
        <ConfirmDelete
          c={overlay.c}
          onConfirm={() => {
            deleteCollection(overlay.c.id);
            toast.show({ kind: 'neutral', icon: 'shelf', eyebrow: 'COLLECTION DELETED', line: overlay.c.name });
            setOverlay(null);
          }}
          onCancel={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.kind === 'keyboard' ? (
        <Keyboard
          title={overlay.mode === 'rename' ? 'RENAME COLLECTION' : 'NEW COLLECTION'}
          initial={overlay.mode === 'rename' ? (overlay.c?.name ?? '') : ''}
          placeholder="Collection name"
          doneLabel={overlay.mode === 'rename' ? 'SAVE' : 'CREATE'}
          validate={nameError}
          onCancel={() => closeKeyboard(overlay)}
          onDone={(text) => {
            if (overlay.mode === 'rename' && overlay.c) {
              renameCollection(overlay.c.id, text);
              toast.show({ kind: 'neutral', icon: 'shelf', eyebrow: 'COLLECTION RENAMED', line: cleanName(text) });
            } else {
              const c = createCollection(text, overlay.withBook ? [overlay.withBook] : []);
              toast.show({ kind: 'neutral', icon: 'shelf', eyebrow: 'COLLECTION CREATED', line: c.name });
              // Focus the new shelf, unless we return to the add sheet.
              if (!overlay.back) setFocused(emptyKey(c.id));
            }
            closeKeyboard(overlay);
          }}
        />
      ) : null}
    </>
  );
}

const bookKey = (collectionId: string, bookId: string) => `b|${collectionId}|${bookId}`;
const emptyKey = (collectionId: string) => `e|${collectionId}`;

function ShelfRow({
  sh,
  focused,
  byId,
  onPick,
}: {
  sh: Shelf;
  focused: string;
  byId: Map<string, ReturnType<typeof useBookViews>[number]>;
  onPick: (id: string) => void;
}) {
  const smart = isSmart(sh.c);
  const [, fc, fb] = focused.split('|');
  const here = fc === sh.c.id;
  const col = here && fb ? Math.max(0, sh.ids.indexOf(fb)) : 0;
  // Keep the focused cover plus one look-ahead visible.
  const first = Math.max(0, Math.min(sh.ids.length - VISIBLE_COVERS, col - (VISIBLE_COVERS - 2)));
  return (
    <section aria-label={sh.c.name} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 className="ellipsis" style={{ margin: 0, font: chakra(600, 18), letterSpacing: '0.08em', color: here ? C.textPrimary : C.textSecondary, maxWidth: 700 }}>
          {sh.c.name.toUpperCase()}
        </h2>
        <span style={{ fontSize: 13, color: C.textDim }}>
          {sh.ids.length} {sh.c.smart === 'manuals' ? 'manual' : 'book'}
          {sh.ids.length === 1 ? '' : 's'}
        </span>
        {smart ? (
          <span style={{ padding: '3px 7px', borderRadius: 5, border: `1px solid ${C.line4}`, font: chakra(700, 10), letterSpacing: '0.12em', color: C.textMuted }}>SMART</span>
        ) : null}
        {here ? <span style={{ marginLeft: 'auto', fontSize: 13, color: C.textDim }}>{smart ? 'Read-only · updates by itself' : 'Menu · rename or delete'}</span> : null}
      </div>
      {/* Room around the row so the focus ring, halo and lift aren't clipped. */}
      <div style={{ position: 'relative', height: 208 + 10 + 4 + 16, margin: '-16px -16px 0', padding: '16px 16px 0', overflow: 'hidden' }}>
        {sh.ids.length ? (
          <div style={{ display: 'flex', gap: COVER_GAP, transform: `translateX(${-first * (COVER_W + COVER_GAP)}px)`, transition: 'transform 160ms ease-out' }}>
            {sh.ids.map((id) => {
              const v = byId.get(id);
              if (!v) return null;
              const key = bookKey(sh.c.id, id);
              return (
                <div key={id} style={{ width: COVER_W, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }} onPointerDown={() => onPick(key)}>
                  <Cover book={v.book} height={208} focused={focused === key} isNew={v.book.lastOpenedAt === undefined} cleared={v.cleared} />
                  <Bar fraction={v.progress} />
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={`focusable${focused === emptyKey(sh.c.id) ? ' is-focused' : ''}`}
            style={{
              width: 340,
              height: 208,
              marginTop: 0,
              borderRadius: 10,
              border: `2px dashed ${C.line4}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 8,
              padding: 24,
            }}
          >
            <span style={{ font: chakra(600, 16), color: C.textSecondary }}>Empty shelf</span>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: C.textDim }}>Go to the Papers or Books shelf and press X on a book to add it here.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function AddToCollection({ bookId, title, onNew, onClose }: { bookId: string; title: string; onNew: () => void; onClose: () => void }) {
  const user = useApp((s) => s.collections);
  const ids = useMemo(() => [...user.map((c) => c.id), 'new'], [user]);
  const graph = useMemo(() => columnGraph(ids), [ids]);
  const { focused, navigate } = useFocus(`add-to:${bookId}`, graph, ids[0]);

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (navigate(e.action)) return;
      if (e.action === 'confirm') {
        if (focused === 'new') onNew();
        else toggleInCollection(focused, bookId);
      }
      if (e.action === 'back' || e.action === 'secondary') onClose();
    },
  });

  const rows: MenuRow[] = [
    ...user.map((c) => ({ id: c.id, label: c.name, value: c.bookIds.includes(bookId) ? '✓ ADDED' : 'ADD', tag: true })),
    { id: 'new', label: 'New collection…', hint: 'Name it with the on-screen keyboard' },
  ];
  return (
    <Sheet
      title="ADD TO COLLECTION"
      prompts={[
        { glyphs: ['A'], label: 'Add / remove' },
        { glyphs: ['B'], label: 'Done' },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="clamp2" style={{ margin: '0 6px', fontSize: 14, color: C.textMuted }}>
          {title}
        </span>
        <MenuList rows={rows} focused={focused} />
      </div>
    </Sheet>
  );
}

function CollectionMenu({
  shelf,
  onRename,
  onDelete,
  onNew,
  onSettings,
  onClose,
}: {
  shelf: Shelf;
  onRename: () => void;
  onDelete: () => void;
  onNew: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const smart = isSmart(shelf.c);
  const ids = useMemo(() => (smart ? ['new', 'settings'] : ['rename', 'delete', 'new', 'settings']), [smart]);
  const graph = useMemo(() => columnGraph(ids), [ids]);
  const { focused, navigate } = useFocus(`collection-menu:${smart}`, graph, ids[0]);

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (navigate(e.action)) return;
      if (e.action === 'confirm') {
        if (focused === 'rename') onRename();
        if (focused === 'delete') onDelete();
        if (focused === 'new') onNew();
        if (focused === 'settings') onSettings();
      }
      if (e.action === 'back' || e.action === 'menu') onClose();
    },
  });

  const labels: Record<string, MenuRow> = {
    rename: { id: 'rename', label: 'Rename' },
    delete: { id: 'delete', label: 'Delete collection', hint: 'The books stay in your library' },
    new: { id: 'new', label: 'New collection…' },
    settings: { id: 'settings', label: 'Settings' },
  };
  return (
    <Dialog
      title={shelf.c.name.toUpperCase()}
      width={460}
      prompts={[
        { glyphs: ['A'], label: 'Choose' },
        { glyphs: ['B'], label: 'Close' },
      ]}
    >
      {smart ? (
        <span style={{ fontSize: 14, lineHeight: 1.45, color: C.textMuted }}>
          A smart collection: it fills itself and can't be renamed or deleted.
          {shelf.c.smart === 'manuals' ? ' To stop scanning game manuals, turn off Game manuals in Settings.' : ''}
        </span>
      ) : null}
      <MenuList rows={ids.map((id) => labels[id]!)} focused={focused} />
    </Dialog>
  );
}

function ConfirmDelete({ c, onConfirm, onCancel }: { c: Collection; onConfirm: () => void; onCancel: () => void }) {
  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (e.action === 'confirm') onConfirm();
      if (e.action === 'back') onCancel();
    },
  });
  return (
    <Dialog
      title="DELETE COLLECTION?"
      width={480}
      prompts={[
        { glyphs: ['A'], label: 'Delete' },
        { glyphs: ['B'], label: 'Cancel' },
      ]}
    >
      <span style={{ fontSize: 15, lineHeight: 1.5, color: C.textSecondary }}>
        “{c.name}” will be removed.{' '}
        {c.bookIds.length === 0 ? "It's empty." : c.bookIds.length === 1 ? 'The book in it stays in your library.' : `The ${c.bookIds.length} books in it stay in your library.`}
      </span>
    </Dialog>
  );
}
