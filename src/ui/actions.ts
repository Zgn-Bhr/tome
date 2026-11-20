// App-level actions: bootstrap, library scan, background indexing, and the
// writes that keep the store and the database in step.

import type { Bookmark, ReadingState, Session, Settings } from '../core/models';
import { deriveStages } from '../core/stages/derive';
import { guessKind } from '../core/library';
import { pdfUrl } from '../shared/api';
import { closePdf, openPdf, readMetadata, readOutline, renderCover, sampleText, type PDFDocumentProxy } from '../pdf/document';
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
  }));
  if (b.settings.rescanOnLaunch || b.books.length === 0) void rescan();
  else void indexPending();
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
    const todo = () =>
      Object.values(store.get().books)
        .filter((b) => b.available && (!b.indexedAt || !b.thumbAt))
        .sort((a, b) => b.addedAt - a.addedAt);
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
export async function indexWithDoc(id: string, doc: PDFDocumentProxy): Promise<void> {
  const book = store.get().books[id];
  if (!book) return;
  {
    let updated = { ...book };
    if (!book.indexedAt) {
      const [meta, outline, text] = await Promise.all([readMetadata(doc), readOutline(doc), sampleText(doc)]);
      const pageCount = doc.numPages;
      const { stages, source } = deriveStages(id, pageCount, outline);
      const isTwoColumn = false; // column detection arrives in M4
      const m = {
        title: meta.title ?? book.title,
        ...(meta.author ? { author: meta.author } : {}),
        pageCount,
        kind: guessKind(pageCount, isTwoColumn, text.hasPaperHeading),
        hasTextLayer: text.hasTextLayer,
        isTwoColumn,
        stageSource: source,
      };
      await api.setBookMeta(id, m, stages);
      updated = { ...updated, ...m, indexedAt: Date.now() };
      store.set((s) => ({ books: { ...s.books, [id]: updated }, stages: { ...s.stages, [id]: stages } }));
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
