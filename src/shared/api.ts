// The typed IPC contract shared by the main process and the renderer.

import type {
  Book,
  BookKind,
  BookStats,
  Bookmark,
  ReadingState,
  Session,
  Settings,
  Stage,
  StageSource,
  XpEvent,
} from '../core/models';

export interface AppEnv {
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
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  listDir(path?: string): Promise<DirListing>;
  quit(): Promise<void>;
  onPower(cb: (e: PowerEvent) => void): () => void;
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
  setSettings: 'tome:setSettings',
  listDir: 'tome:listDir',
  quit: 'tome:quit',
  power: 'tome:power',
} as const;

/** All app-served resources share one origin so production needs no CORS. */
export const SCHEME = 'tome';
export const pdfUrl = (bookId: string) => `${SCHEME}://app/__pdf/${bookId}`;
export const thumbUrl = (bookId: string, version: number) => `${SCHEME}://app/__thumb/${bookId}.webp?v=${version}`;
