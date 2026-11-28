// The typed IPC contract shared by the main process and the renderer.

import type { Box } from '../core/layout/box';
import type {
  Book,
  BookKind,
  BookStats,
  Bookmark,
  Collection,
  PageProgress,
  ReadingState,
  Session,
  Settings,
  Stage,
  StageSource,
  TrophyUnlock,
  XpEvent,
} from '../core/models';

export interface AppEnv {
  /** The app's version, e.g. "0.6.0". */
  version: string;
  platform: string;
  /** Running inside gamescope / Steam Game Mode (best guess, verify on device). */
  gameMode: boolean;
  isDev: boolean;
  dataDir: string;
  homeDir: string;
  /** Library folders were overridden with TOME_LIBRARY_DIRS (development). */
  libraryOverride: boolean;
}

export interface Bootstrap {
  env: AppEnv;
  settings: Settings;
  /** Settings have never been saved and the scan found nothing: show first run. */
  firstRun: boolean;
  books: Book[];
  stages: Stage[];
  readingStates: ReadingState[];
  bookmarks: Bookmark[];
  stats: BookStats[];
  xpEvents: XpEvent[];
  /** Counted pages per reading day. */
  pagesByDay: [string, number][];
  /** Counted page numbers per book. */
  counted: [string, number[]][];
  trophies: TrophyUnlock[];
  /** Most counted pages in any one session (Marathon progress). */
  bestSessionPages: number;
  /** User collections, in creation order (smart ones are computed). */
  collections: Collection[];
}

/** One write of game-layer progress (§4): page rows, new ledger events, unlocks. */
export interface GameBatch {
  progress: PageProgress[];
  xp: XpEvent[];
  trophies: TrophyUnlock[];
}

export interface LibrarySnapshot {
  books: Book[];
  stages: Stage[];
}

export interface BookMetaUpdate {
  title: string;
  author?: string;
  pageCount: number;
  kind: BookKind;
  hasTextLayer: boolean;
  isTwoColumn: boolean;
  stageSource: StageSource;
  cropOdd?: Box;
  cropEven?: Box;
  layoutVersion: number;
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirListing {
  path: string;
  parent?: string;
  dirs: DirEntry[];
  /** PDFs directly inside this folder. */
  pdfCount: number;
  /** Shortcuts: home folders and SD cards. */
  roots: { label: string; path: string }[];
  error?: string;
}

export type PowerEvent = 'suspend' | 'resume';

/**
 * In-app updates (platform/updater.ts). Only the AppImage can update itself;
 * elsewhere (development, macOS) the state stays `unsupported`.
 */
export type UpdateState =
  | { kind: 'unsupported' }
  | { kind: 'idle'; checkedAt?: number }
  | { kind: 'checking' }
  | { kind: 'current'; checkedAt: number }
  | { kind: 'available'; version: string; title: string; size: number }
  | { kind: 'downloading'; version: string; received: number; size: number }
  /** Installed in place: the next start (or Restart now) runs the new version. */
  | { kind: 'ready'; version: string }
  /** `version` is set when a download failed, so it can be retried. */
  | { kind: 'error'; message: string; version?: string };

export interface TomeApi {
  bootstrap(): Promise<Bootstrap>;
  scanLibrary(): Promise<LibrarySnapshot>;
  setBookMeta(bookId: string, meta: BookMetaUpdate, stages: Stage[]): Promise<void>;
  saveThumb(bookId: string, webp: Uint8Array): Promise<number>;
  saveReadingState(state: ReadingState): Promise<void>;
  markOpened(bookId: string): Promise<number>;
  addBookmark(bookmark: Bookmark): Promise<void>;
  removeBookmark(id: string): Promise<void>;
  saveSession(session: Session): Promise<void>;
  pageProgress(bookId: string): Promise<PageProgress[]>;
  recordGame(batch: GameBatch): Promise<void>;
  saveCollection(c: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  listDir(path?: string): Promise<DirListing>;
  quit(): Promise<void>;
  onPower(cb: (e: PowerEvent) => void): () => void;
  updateState(): Promise<UpdateState>;
  /** Ask GitHub now (Settings → Software update). */
  checkForUpdates(): Promise<UpdateState>;
  /** Download, verify and install the available version in place. */
  downloadUpdate(): Promise<void>;
  /** Quit and start the installed version. */
  restartToUpdate(): Promise<void>;
  onUpdate(cb: (s: UpdateState) => void): () => void;
}

export const IPC = {
  bootstrap: 'tome:bootstrap',
  scanLibrary: 'tome:scanLibrary',
  setBookMeta: 'tome:setBookMeta',
  saveThumb: 'tome:saveThumb',
  saveReadingState: 'tome:saveReadingState',
  markOpened: 'tome:markOpened',
  addBookmark: 'tome:addBookmark',
  removeBookmark: 'tome:removeBookmark',
  saveSession: 'tome:saveSession',
  pageProgress: 'tome:pageProgress',
  recordGame: 'tome:recordGame',
  saveCollection: 'tome:saveCollection',
  deleteCollection: 'tome:deleteCollection',
  setSettings: 'tome:setSettings',
  listDir: 'tome:listDir',
  quit: 'tome:quit',
  power: 'tome:power',
  updateState: 'tome:updateState',
  checkForUpdates: 'tome:checkForUpdates',
  downloadUpdate: 'tome:downloadUpdate',
  restartToUpdate: 'tome:restartToUpdate',
  update: 'tome:update',
} as const;

/** All app-served resources share one origin so production needs no CORS. */
export const SCHEME = 'tome';
export const pdfUrl = (bookId: string) => `${SCHEME}://app/__pdf/${bookId}`;
export const thumbUrl = (bookId: string, version: number) => `${SCHEME}://app/__thumb/${bookId}.webp?v=${version}`;
