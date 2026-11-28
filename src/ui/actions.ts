// App-level actions: bootstrap, library scan, background indexing, and the
// writes that keep the store and the database in step.

import type { Book, Bookmark, Collection, ReadingState, Session, Settings } from '../core/models';
import { cleanName, toggleBook } from '../core/collections';
import { deriveStages, outlineUsable } from '../core/stages/derive';
import { ledgerFacts } from '../core/gamification/engine';
import { LAYOUT_VERSION, analyseBook } from '../pdf/analyse';
import { guessKind } from '../core/library';
import { pdfUrl, type BookMetaUpdate, type GameBatch } from '../shared/api';
import { readingDayKey } from '../core/time';
import { closePdf, openPdf, readMetadata, readOutline, renderCover, type PDFDocumentProxy } from '../pdf/document';
import { api } from './api';
import { groupBy, store } from './store';

export async function bootstrap(): Promise<void> {
  const b = await api.bootstrap();
  store.set(() => ({
    ready: true,
    env: b.env,
    settings: b.settings,
    firstRun: b.firstRun,
    books: Object.fromEntries(b.books.map((x) => [x.id, x])),
    stages: groupBy(b.stages, (s) => s.bookId),
    states: Object.fromEntries(b.readingStates.map((s) => [s.bookId, s])),
    bookmarks: groupBy(b.bookmarks, (x) => x.bookId),
    stats: Object.fromEntries(b.stats.map((s) => [s.bookId, s])),
    xpEvents: b.xpEvents,
    pagesByDay: new Map(b.pagesByDay),
    counted: Object.fromEntries(b.counted.map(([id, pages]) => [id, new Set(pages)])),
    trophies: b.trophies,
    bestSessionPages: b.bestSessionPages,
    collections: b.collections,
  }));
  if (b.settings.rescanOnLaunch || b.books.length === 0) void rescan();
  else void indexPending();
  api.onUpdate((update) => store.set(() => ({ update })));
  const update = await api.updateState();
  store.set(() => ({ update }));
}

// ── In-app updates ──────────────────────────────────────────────────────

export function checkForUpdates(): void {
  void api.checkForUpdates();
}

export function downloadUpdate(): void {
  void api.downloadUpdate();
}

export function restartToUpdate(): void {
  void api.restartToUpdate();
}

export async function rescan(): Promise<void> {
  store.set(() => ({ scanning: true }));
  try {
    const snap = await api.scanLibrary();
    store.set(() => ({
      books: Object.fromEntries(snap.books.map((x) => [x.id, x])),
      stages: groupBy(snap.stages, (s) => s.bookId),
    }));
  } finally {
    store.set(() => ({ scanning: false }));
  }
  void indexPending();
}

let indexing = false;

/**
 * Read metadata, outline → stages, and the cover for every book that still
 * needs it. Runs one book at a time, newest first, and pauses while reading.
 */
export async function indexPending(): Promise<void> {
  if (indexing) return;
  indexing = true;
  try {
    // Game manuals wait until the books are done, and are skipped while they're hidden.
    const todo = () => {
      const s = store.get();
      return Object.values(s.books)
        .filter((b) => b.available && (s.settings.gameManuals || b.kind !== 'manual') && (needsLayout(b) || !b.thumbAt))
        .sort((a, b) => Number(a.kind === 'manual') - Number(b.kind === 'manual') || b.addedAt - a.addedAt);
    };
    const total = todo().length;
    let done = 0;
    if (total) store.set(() => ({ indexing: { done, total } }));
    for (;;) {
      while (store.get().reading) await sleep(1000);
      const next = todo()[0];
      if (!next) break;
      try {
        await indexBook(next.id);
      } catch (e) {
        console.warn('index failed', next.path, e);
        // Mark as indexed with what we know so we don't retry forever this run.
        store.set((s) => ({ books: { ...s.books, [next.id]: { ...next, indexedAt: Date.now(), thumbAt: next.thumbAt ?? -1 } } }));
      }
      done++;
      store.set(() => ({ indexing: { done, total: Math.max(total, done) } }));
      await sleep(30); // stay low priority
    }
  } finally {
    indexing = false;
    store.set(() => ({ indexing: null }));
  }
}

async function indexBook(id: string): Promise<void> {
  if (!store.get().books[id]) return;
  const doc = await openPdf(pdfUrl(id));
  try {
    await indexWithDoc(id, doc);
  } finally {
    closePdf(doc);
  }
}

/** Index a book using an already-open document (the reader calls this). */
/** Not yet indexed, or indexed by an older layout analysis (§8.5, §8.6). */
export function needsLayout(b: Book): boolean {
  return !b.indexedAt || (b.layoutVersion ?? 0) < LAYOUT_VERSION;
}

export async function indexWithDoc(id: string, doc: PDFDocumentProxy): Promise<void> {
  const book = store.get().books[id];
  if (!book) return;
  {
    let updated = { ...book };
    if (needsLayout(book)) {
      const [meta, outline] = await Promise.all([readMetadata(doc), readOutline(doc)]);
      const pageCount = doc.numPages;
      const usable = outlineUsable(outline, pageCount);
      const a = await analyseBook(doc, !usable);
      // Re-analysing a book (new layout version) keeps stages the reader may have
      // progress against: cleared stages are tied to stage indices.
      const s = store.get();
      const hasClears = (ledgerFacts(s.xpEvents).clearedStages.get(id)?.size ?? 0) > 0;
      const keep = !!book.indexedAt && (hasClears || book.stageSource === 'outline') && !!s.stages[id]?.length;
      const derived = keep ? { stages: s.stages[id]!, source: book.stageSource } : deriveStages(id, pageCount, outline, a.headings);
      // A game manual keeps the title from its file name and the system as its author
      // (set when the library is read); scraped PDFs rarely have useful metadata.
      const manual = book.kind === 'manual';
      const m: BookMetaUpdate = {
        title: manual ? book.title : (meta.title ?? book.title),
        ...(!manual && meta.author ? { author: meta.author } : book.author ? { author: book.author } : {}),
        pageCount,
        kind: manual ? 'manual' : guessKind(pageCount, a.isTwoColumn, a.hasPaperHeading),
        hasTextLayer: a.hasTextLayer,
        isTwoColumn: a.isTwoColumn,
        stageSource: derived.source,
        ...(a.crop?.odd ? { cropOdd: a.crop.odd } : {}),
        ...(a.crop?.even ? { cropEven: a.crop.even } : {}),
        layoutVersion: LAYOUT_VERSION,
      };
      await api.setBookMeta(id, m, derived.stages);
      updated = { ...updated, ...m, indexedAt: Date.now() };
      store.set((st) => ({ books: { ...st.books, [id]: updated }, stages: { ...st.stages, [id]: derived.stages } }));
    }
    if (!book.thumbAt) {
      const webp = await renderCover(doc);
      const at = await api.saveThumb(id, webp);
      updated = { ...updated, thumbAt: at };
      store.set((s) => ({ books: { ...s.books, [id]: updated } }));
    }
  }
}

export async function addFolder(path: string): Promise<void> {
  const s = store.get().settings;
  const folders = s.folders.includes(path) ? s.folders : [...s.folders, path];
  await updateSettings({ folders });
  store.set(() => ({ firstRun: false }));
  await rescan();
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const settings = await api.setSettings(patch);
  store.set(() => ({ settings }));
}

export function saveReadingState(state: ReadingState): void {
  store.set((s) => ({ states: { ...s.states, [state.bookId]: state } }));
  void api.saveReadingState(state);
}

export async function markOpened(bookId: string): Promise<void> {
  const at = await api.markOpened(bookId);
  store.set((s) => {
    const b = s.books[bookId];
    return b ? { books: { ...s.books, [bookId]: { ...b, lastOpenedAt: at } } } : {};
  });
}

/** Toggle a bookmark on `page`; returns whether one now exists. */
export async function toggleBookmark(bookId: string, page: number, scrollY: number): Promise<boolean> {
  const list = store.get().bookmarks[bookId] ?? [];
  const existing = list.find((b) => b.page === page);
  if (existing) {
    store.set((s) => ({ bookmarks: { ...s.bookmarks, [bookId]: list.filter((b) => b.id !== existing.id) } }));
    await api.removeBookmark(existing.id);
    return false;
  }
  const b: Bookmark = { id: crypto.randomUUID(), bookId, page, scrollY, createdAt: Date.now() };
  store.set((s) => ({ bookmarks: { ...s.bookmarks, [bookId]: [...list, b].sort((x, y) => x.page - y.page) } }));
  await api.addBookmark(b);
  return true;
}

export async function removeBookmark(bookId: string, id: string): Promise<void> {
  store.set((s) => ({ bookmarks: { ...s.bookmarks, [bookId]: (s.bookmarks[bookId] ?? []).filter((b) => b.id !== id) } }));
  await api.removeBookmark(id);
}

/**
 * Store and persist game progress: page rows, new ledger events and unlocks.
 * `newlyCounted` pages also update the counted set and today's page count.
 */
export function recordGame(batch: GameBatch, newlyCounted: { bookId: string; page: number; at: number }[], sessionPages: number): void {
  if (!batch.progress.length && !batch.xp.length && !batch.trophies.length) return;
  void api.recordGame(batch);
  if (!newlyCounted.length && !batch.xp.length && !batch.trophies.length) return;
  store.set((s) => {
    const counted = { ...s.counted };
    const pagesByDay = new Map(s.pagesByDay);
    for (const c of newlyCounted) {
      const set = new Set(counted[c.bookId] ?? []);
      if (set.has(c.page)) continue;
      set.add(c.page);
      counted[c.bookId] = set;
      const day = readingDayKey(c.at);
      pagesByDay.set(day, (pagesByDay.get(day) ?? 0) + 1);
    }
    return {
      counted,
      pagesByDay,
      xpEvents: batch.xp.length ? [...s.xpEvents, ...batch.xp] : s.xpEvents,
      trophies: batch.trophies.length ? [...s.trophies, ...batch.trophies] : s.trophies,
      bestSessionPages: Math.max(s.bestSessionPages, sessionPages),
    };
  });
}

// ── Collections (§7.8) ────────────────────────────────────────────────────

function putCollection(c: Collection): void {
  store.set((s) => {
    const i = s.collections.findIndex((x) => x.id === c.id);
    const collections = i >= 0 ? s.collections.map((x) => (x.id === c.id ? c : x)) : [...s.collections, c];
    return { collections };
  });
  void api.saveCollection(c);
}

export function createCollection(name: string, bookIds: string[] = []): Collection {
  const c: Collection = { id: crypto.randomUUID(), name: cleanName(name), bookIds };
  putCollection(c);
  return c;
}

export function renameCollection(id: string, name: string): void {
  const c = store.get().collections.find((x) => x.id === id);
  if (c) putCollection({ ...c, name: cleanName(name) });
}

export function deleteCollection(id: string): void {
  store.set((s) => ({ collections: s.collections.filter((x) => x.id !== id) }));
  void api.deleteCollection(id);
}

/** Add or remove a book; returns true if the book is now in the collection. */
export function toggleInCollection(id: string, bookId: string): boolean {
  const c = store.get().collections.find((x) => x.id === id);
  if (!c) return false;
  const next = toggleBook(c, bookId);
  putCollection(next);
  return next.bookIds.includes(bookId);
}

/** Persist a session and fold it into the per-book stats. */
export function saveSession(session: Session, previousActiveMs: number): void {
  void api.saveSession(session);
  store.set((s) => {
    const prev = s.stats[session.bookId];
    const isNew = previousActiveMs === 0 && session.activeMs > 0;
    const stats = {
      bookId: session.bookId,
      activeMs: (prev?.activeMs ?? 0) + (session.activeMs - previousActiveMs),
      sessions: (prev?.sessions ?? 0) + (isNew ? 1 : 0),
      lastSessionAt: session.endedAt ?? Date.now(),
    };
    return { stats: { ...s.stats, [session.bookId]: stats } };
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
