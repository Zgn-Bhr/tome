// SQLite storage via Node's built-in node:sqlite (bundled with Electron 45),
// in WAL mode so nothing is lost across suspend or a hard power-off (§12).

import { DatabaseSync } from 'node:sqlite';
import type { Book, BookStats, Bookmark, Collection, PageProgress, ReadingState, Session, Stage, TrophyUnlock, XpEvent } from '../core/models';
import type { BookMetaUpdate, GameBatch } from '../shared/api';
import type { Box } from '../core/layout/box';
import { readingDayKey } from '../core/time';
import { gameManual, manualTitle, systemName } from '../core/manuals';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  author TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'book',
  has_text_layer INTEGER NOT NULL DEFAULT 0,
  is_two_column INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  last_opened_at INTEGER,
  stage_source TEXT NOT NULL DEFAULT 'even',
  file_size INTEGER NOT NULL,
  file_mtime INTEGER NOT NULL,
  indexed_at INTEGER,
  thumb_at INTEGER
);
CREATE INDEX IF NOT EXISTS books_path ON books(path);
CREATE TABLE IF NOT EXISTS stages (
  book_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  label TEXT NOT NULL,
  numeral TEXT,
  start_page INTEGER NOT NULL,
  end_page INTEGER NOT NULL,
  is_final INTEGER NOT NULL,
  PRIMARY KEY (book_id, idx)
);
CREATE TABLE IF NOT EXISTS reading_state (
  book_id TEXT PRIMARY KEY,
  page INTEGER NOT NULL,
  scroll_y REAL NOT NULL,
  segment INTEGER,
  zoom REAL NOT NULL,
  fit TEXT NOT NULL,
  fit_chosen INTEGER NOT NULL DEFAULT 0,
  theme_override TEXT,
  orientation TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS page_progress (
  book_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  dwell_ms INTEGER NOT NULL,
  viewed_fraction REAL NOT NULL,
  counted INTEGER NOT NULL,
  counted_at INTEGER,
  PRIMARY KEY (book_id, page)
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  scroll_y REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  active_ms INTEGER NOT NULL,
  start_page INTEGER NOT NULL,
  end_page INTEGER,
  counted_pages INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS xp_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  book_id TEXT,
  stage_index INTEGER,
  page INTEGER,
  session_id TEXT
);
CREATE TABLE IF NOT EXISTS trophy_unlocks (
  trophy_id TEXT NOT NULL,
  book_id TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  PRIMARY KEY (trophy_id, book_id)
);
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  smart TEXT,
  book_ids TEXT NOT NULL DEFAULT '[]'
);
`;

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

function rowToBook(r: Row): Book {
  // Game manuals are recognised from the path every time, so books indexed before
  // manuals existed (or moved in or out of an ES-DE folder) need no re-indexing.
  // Their title comes from the file name and the "author" line names the system.
  const manual = gameManual(String(r.path));
  const author = manual ? systemName(manual.system) : str(r.author);
  return {
    id: String(r.id),
    path: String(r.path),
    available: Number(r.available) === 1,
    title: manual ? manualTitle(String(r.path)) : String(r.title),
    ...(author ? { author } : {}),
    pageCount: Number(r.page_count),
    kind: manual ? 'manual' : r.kind === 'paper' ? 'paper' : 'book',
    hasTextLayer: Number(r.has_text_layer) === 1,
    isTwoColumn: Number(r.is_two_column) === 1,
    addedAt: Number(r.added_at),
    ...(num(r.last_opened_at) !== undefined ? { lastOpenedAt: num(r.last_opened_at)! } : {}),
    stageSource: (str(r.stage_source) as Book['stageSource']) ?? 'even',
    ...(num(r.indexed_at) !== undefined ? { indexedAt: num(r.indexed_at)! } : {}),
    ...(num(r.thumb_at) !== undefined ? { thumbAt: num(r.thumb_at)! } : {}),
    fileSize: Number(r.file_size),
    ...(parseBox(r.crop_odd) ? { cropOdd: parseBox(r.crop_odd)! } : {}),
    ...(parseBox(r.crop_even) ? { cropEven: parseBox(r.crop_even)! } : {}),
    ...(num(r.layout_version) !== undefined ? { layoutVersion: num(r.layout_version)! } : {}),
  };
}

function parseBox(v: unknown): Box | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    const b = JSON.parse(v) as Box;
    return [b.x0, b.y0, b.x1, b.y1].every((n) => typeof n === 'number' && Number.isFinite(n)) ? b : undefined;
  } catch {
    return undefined;
  }
}

/** Columns added after the first release; ALTER TABLE adds them to older databases. */
const BOOK_COLUMNS: [string, string][] = [
  ['crop_odd', 'TEXT'],
  ['crop_even', 'TEXT'],
  ['layout_version', 'INTEGER'],
];

/** Reading-state columns added after the first release. */
const STATE_COLUMNS: [string, string][] = [['spread_cover', 'INTEGER']];

export interface FileRow {
  id: string;
  path: string;
  size: number;
  mtime: number;
}

export class TomeDb {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    const have = new Set((this.db.prepare('PRAGMA table_info(books)').all() as Row[]).map((r) => String(r.name)));
    for (const [name, type] of BOOK_COLUMNS) if (!have.has(name)) this.db.exec(`ALTER TABLE books ADD COLUMN ${name} ${type}`);
    const haveState = new Set((this.db.prepare('PRAGMA table_info(reading_state)').all() as Row[]).map((r) => String(r.name)));
    for (const [name, type] of STATE_COLUMNS) if (!haveState.has(name)) this.db.exec(`ALTER TABLE reading_state ADD COLUMN ${name} ${type}`);
  }

  close(): void {
    this.db.close();
  }

  // ── Books ──────────────────────────────────────────────────────────────

  books(): Book[] {
    return (this.db.prepare('SELECT * FROM books ORDER BY added_at DESC').all() as Row[]).map(rowToBook);
  }

  bookPath(id: string): string | undefined {
    const r = this.db.prepare('SELECT path FROM books WHERE id = ? AND available = 1').get(id) as Row | undefined;
    return r ? String(r.path) : undefined;
  }

  fileIndex(): Map<string, FileRow> {
    const rows = this.db.prepare('SELECT id, path, file_size, file_mtime FROM books').all() as Row[];
    return new Map(
      rows.map((r) => [String(r.path), { id: String(r.id), path: String(r.path), size: Number(r.file_size), mtime: Number(r.file_mtime) }]),
    );
  }

  /** Apply one scan: insert new books, update moved ones, flag missing ones. */
  applyScan(found: { id: string; path: string; size: number; mtime: number; title: string; addedAt: number }[]): void {
    const seen = new Set(found.map((f) => f.id));
    const exists = this.db.prepare('SELECT id FROM books WHERE id = ?');
    const insert = this.db.prepare(
      `INSERT INTO books (id, path, available, title, added_at, file_size, file_mtime)
       VALUES (?, ?, 1, ?, ?, ?, ?)`,
    );
    const update = this.db.prepare('UPDATE books SET path = ?, available = 1, file_size = ?, file_mtime = ? WHERE id = ?');
    this.tx(() => {
      for (const f of found) {
        if (exists.get(f.id)) update.run(f.path, f.size, f.mtime, f.id);
        else insert.run(f.id, f.path, f.title, f.addedAt, f.size, f.mtime);
      }
      const all = this.db.prepare('SELECT id FROM books WHERE available = 1').all() as Row[];
      const missing = this.db.prepare('UPDATE books SET available = 0 WHERE id = ?');
      for (const r of all) if (!seen.has(String(r.id))) missing.run(String(r.id));
    });
  }

  setBookMeta(id: string, m: BookMetaUpdate, stages: Stage[]): void {
    this.tx(() => {
      this.db
        .prepare(
          `UPDATE books SET title = ?, author = ?, page_count = ?, kind = ?, has_text_layer = ?,
           is_two_column = ?, stage_source = ?, indexed_at = ?, crop_odd = ?, crop_even = ?, layout_version = ? WHERE id = ?`,
        )
        .run(
          m.title,
          m.author ?? null,
          m.pageCount,
          m.kind,
          m.hasTextLayer ? 1 : 0,
          m.isTwoColumn ? 1 : 0,
          m.stageSource,
          Date.now(),
          m.cropOdd ? JSON.stringify(m.cropOdd) : null,
          m.cropEven ? JSON.stringify(m.cropEven) : null,
          m.layoutVersion,
          id,
        );
      this.db.prepare('DELETE FROM stages WHERE book_id = ?').run(id);
      const ins = this.db.prepare(
        'INSERT INTO stages (book_id, idx, label, numeral, start_page, end_page, is_final) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const s of stages) ins.run(id, s.index, s.label, s.numeral ?? null, s.startPage, s.endPage, s.isFinal ? 1 : 0);
    });
  }

  setThumb(id: string, at: number): void {
    this.db.prepare('UPDATE books SET thumb_at = ? WHERE id = ?').run(at, id);
  }

  markOpened(id: string, at: number): void {
    this.db.prepare('UPDATE books SET last_opened_at = ? WHERE id = ?').run(at, id);
  }

  stages(): Stage[] {
    return (this.db.prepare('SELECT * FROM stages ORDER BY book_id, idx').all() as Row[]).map((r) => ({
      bookId: String(r.book_id),
      index: Number(r.idx),
      label: String(r.label),
      ...(str(r.numeral) ? { numeral: str(r.numeral)! } : {}),
      startPage: Number(r.start_page),
      endPage: Number(r.end_page),
      isFinal: Number(r.is_final) === 1,
    }));
  }

  // ── Reading state, bookmarks, sessions ────────────────────────────────

  readingStates(): ReadingState[] {
    return (this.db.prepare('SELECT * FROM reading_state').all() as Row[]).map((r) => ({
      bookId: String(r.book_id),
      page: Number(r.page),
      scrollY: Number(r.scroll_y),
      ...(num(r.segment) !== undefined ? { segment: num(r.segment)! } : {}),
      zoom: Number(r.zoom),
      fit: String(r.fit) as ReadingState['fit'],
      fitChosen: Number(r.fit_chosen) === 1,
      ...(str(r.theme_override) ? { themeOverride: str(r.theme_override) as ReadingState['themeOverride'] } : {}),
      orientation: String(r.orientation) as ReadingState['orientation'],
      ...(num(r.spread_cover) !== undefined ? { spreadCover: Number(r.spread_cover) === 1 } : {}),
    }));
  }

  saveReadingState(s: ReadingState): void {
    this.db
      .prepare(
        `INSERT INTO reading_state (book_id, page, scroll_y, segment, zoom, fit, fit_chosen, theme_override, orientation, updated_at, spread_cover)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_id) DO UPDATE SET page = excluded.page, scroll_y = excluded.scroll_y, segment = excluded.segment,
           zoom = excluded.zoom, fit = excluded.fit, fit_chosen = excluded.fit_chosen, theme_override = excluded.theme_override,
           orientation = excluded.orientation, updated_at = excluded.updated_at, spread_cover = excluded.spread_cover`,
      )
      .run(
        s.bookId,
        s.page,
        s.scrollY,
        s.segment ?? null,
        s.zoom,
        s.fit,
        s.fitChosen ? 1 : 0,
        s.themeOverride ?? null,
        s.orientation,
        Date.now(),
        s.spreadCover === undefined ? null : s.spreadCover ? 1 : 0,
      );
  }

  bookmarks(): Bookmark[] {
    return (this.db.prepare('SELECT * FROM bookmarks ORDER BY book_id, page').all() as Row[]).map((r) => ({
      id: String(r.id),
      bookId: String(r.book_id),
      page: Number(r.page),
      scrollY: Number(r.scroll_y),
      createdAt: Number(r.created_at),
    }));
  }

  addBookmark(b: Bookmark): void {
    this.db
      .prepare('INSERT OR REPLACE INTO bookmarks (id, book_id, page, scroll_y, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(b.id, b.bookId, b.page, b.scrollY, b.createdAt);
  }

  removeBookmark(id: string): void {
    this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  }

  saveSession(s: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, book_id, started_at, ended_at, active_ms, start_page, end_page, counted_pages)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ended_at = excluded.ended_at, active_ms = excluded.active_ms,
           end_page = excluded.end_page, counted_pages = excluded.counted_pages`,
      )
      .run(s.id, s.bookId, s.startedAt, s.endedAt ?? null, Math.round(s.activeMs), s.startPage, s.endPage ?? null, s.countedPages);
  }

  bookStats(): BookStats[] {
    const rows = this.db
      .prepare(
        `SELECT book_id, SUM(active_ms) AS active_ms, COUNT(*) AS sessions, MAX(COALESCE(ended_at, started_at)) AS last_at
         FROM sessions WHERE active_ms > 0 GROUP BY book_id`,
      )
      .all() as Row[];
    return rows.map((r) => ({
      bookId: String(r.book_id),
      activeMs: Number(r.active_ms),
      sessions: Number(r.sessions),
      ...(num(r.last_at) !== undefined ? { lastSessionAt: num(r.last_at)! } : {}),
    }));
  }

  // ── Collections (user ones; smart ones are computed) ──────────────────

  collections(): Collection[] {
    return (this.db.prepare('SELECT * FROM collections WHERE smart IS NULL ORDER BY rowid').all() as Row[]).map((r) => {
      let bookIds: string[] = [];
      try {
        const parsed = JSON.parse(String(r.book_ids)) as unknown;
        if (Array.isArray(parsed)) bookIds = parsed.filter((x): x is string => typeof x === 'string');
      } catch {
        /* corrupt row: treat as empty */
      }
      return { id: String(r.id), name: String(r.name), bookIds };
    });
  }

  saveCollection(c: Collection): void {
    this.db
      .prepare(
        `INSERT INTO collections (id, name, smart, book_ids) VALUES (?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, book_ids = excluded.book_ids`,
      )
      .run(c.id, c.name, JSON.stringify(c.bookIds));
  }

  deleteCollection(id: string): void {
    this.db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  }

  // ── Game layer ────────────────────────────────────────────────────────

  pageProgress(bookId: string): PageProgress[] {
    return (this.db.prepare('SELECT * FROM page_progress WHERE book_id = ? ORDER BY page').all(bookId) as Row[]).map((r) => ({
      bookId: String(r.book_id),
      page: Number(r.page),
      dwellMs: Number(r.dwell_ms),
      viewedFraction: Number(r.viewed_fraction),
      counted: Number(r.counted) === 1,
      ...(num(r.counted_at) !== undefined ? { countedAt: num(r.counted_at)! } : {}),
    }));
  }

  /** Counted pages per book (for progress bars and per-stage counts). */
  countedPages(): [string, number[]][] {
    const rows = this.db.prepare('SELECT book_id, page FROM page_progress WHERE counted = 1 ORDER BY book_id, page').all() as Row[];
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const id = String(r.book_id);
      const list = map.get(id) ?? [];
      list.push(Number(r.page));
      map.set(id, list);
    }
    return [...map.entries()];
  }

  trophyUnlocks(): TrophyUnlock[] {
    return (this.db.prepare('SELECT * FROM trophy_unlocks ORDER BY at').all() as Row[]).map((r) => ({
      trophyId: String(r.trophy_id),
      ...(str(r.book_id) ? { bookId: str(r.book_id)! } : {}),
      at: Number(r.at),
    }));
  }

  bestSessionPages(): number {
    const r = this.db.prepare('SELECT MAX(counted_pages) AS m FROM sessions').get() as Row | undefined;
    return Number(r?.m ?? 0);
  }

  /** Page progress, new XP events and trophy unlocks, in one transaction. */
  recordGame(b: GameBatch): void {
    const prog = this.db.prepare(
      `INSERT INTO page_progress (book_id, page, dwell_ms, viewed_fraction, counted, counted_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id, page) DO UPDATE SET
         dwell_ms = MAX(page_progress.dwell_ms, excluded.dwell_ms),
         viewed_fraction = MAX(page_progress.viewed_fraction, excluded.viewed_fraction),
         counted = MAX(page_progress.counted, excluded.counted),
         counted_at = COALESCE(page_progress.counted_at, excluded.counted_at)`,
    );
    const xp = this.db.prepare(
      'INSERT OR IGNORE INTO xp_events (id, at, amount, reason, book_id, stage_index, page, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const trophy = this.db.prepare('INSERT OR IGNORE INTO trophy_unlocks (trophy_id, book_id, at) VALUES (?, ?, ?)');
    this.tx(() => {
      for (const p of b.progress) prog.run(p.bookId, p.page, Math.round(p.dwellMs), p.viewedFraction, p.counted ? 1 : 0, p.countedAt ?? null);
      for (const e of b.xp) xp.run(e.id, e.at, e.amount, e.reason, e.bookId ?? null, e.stageIndex ?? null, e.page ?? null, e.sessionId ?? null);
      for (const t of b.trophies) trophy.run(t.trophyId, t.bookId ?? '', t.at);
    });
  }

  xpEvents(): XpEvent[] {
    return (this.db.prepare('SELECT * FROM xp_events ORDER BY at').all() as Row[]).map((r) => ({
      id: String(r.id),
      at: Number(r.at),
      amount: Number(r.amount),
      reason: String(r.reason) as XpEvent['reason'],
      ...(str(r.book_id) ? { bookId: str(r.book_id)! } : {}),
      ...(num(r.stage_index) !== undefined ? { stageIndex: num(r.stage_index)! } : {}),
      ...(num(r.page) !== undefined ? { page: num(r.page)! } : {}),
      ...(str(r.session_id) ? { sessionId: str(r.session_id)! } : {}),
    }));
  }

  pagesByDay(): [string, number][] {
    const rows = this.db.prepare('SELECT counted_at FROM page_progress WHERE counted = 1 AND counted_at IS NOT NULL').all() as Row[];
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = readingDayKey(Number(r.counted_at));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()];
  }

  private tx(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
