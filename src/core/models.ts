// Data model (spec §4). Pure types, shared by every layer.

import type { Box } from './layout/box';

export type BookId = string; // sha1 of (file size + first 1 MiB)

/** `manual`: a game manual downloaded by ES-DE, recognised from its path (core/manuals.ts). */
export type BookKind = 'book' | 'paper' | 'manual';
export type StageSource = 'outline' | 'headings' | 'even';
export type PageTheme = 'paper' | 'sepia' | 'night' | 'dim';
/** `spread`: two pages side by side (core/reader/spread.ts). */
export type FitMode = 'width' | 'page' | 'column' | 'spread';
export type Orientation = 'landscape' | 'tate-left' | 'tate-right';

export interface Book {
  id: BookId;
  path: string;
  available: boolean;
  title: string;
  author?: string;
  pageCount: number; // 0 until indexed
  kind: BookKind;
  hasTextLayer: boolean;
  isTwoColumn: boolean;
  addedAt: number;
  lastOpenedAt?: number;
  stageSource: StageSource;
  /** Set once pdf.js has read metadata, outline and stages. */
  indexedAt?: number;
  /** Set once a cover thumbnail exists; used as a cache-buster. */
  thumbAt?: number;
  fileSize: number;
  /** Median content boxes for odd and even pages (auto-crop, §8.6). */
  cropOdd?: Box;
  cropEven?: Box;
  /** Version of the layout analysis this book was indexed with. */
  layoutVersion?: number;
}

export interface Stage {
  bookId: BookId;
  index: number;
  label: string;
  numeral?: string;
  startPage: number; // 1-based inclusive
  endPage: number; // inclusive
  isFinal: boolean;
}

export interface ReadingState {
  bookId: BookId;
  page: number;
  scrollY: number; // 0..1 within the page
  segment?: number;
  zoom: number; // relative to fit
  fit: FitMode;
  /** True when the user picked a fit; false means "auto" (§11 Default fit). */
  fitChosen?: boolean;
  themeOverride?: PageTheme;
  orientation: Orientation;
  /** Two-page view: page 1 stands alone (a cover or title page). Default true. */
  spreadCover?: boolean;
}

export interface PageProgress {
  bookId: BookId;
  page: number;
  dwellMs: number;
  viewedFraction: number;
  counted: boolean;
  countedAt?: number;
}

export interface Bookmark {
  id: string;
  bookId: BookId;
  page: number;
  scrollY: number;
  createdAt: number;
}

export interface Session {
  id: string;
  bookId: BookId;
  startedAt: number;
  endedAt?: number;
  activeMs: number;
  startPage: number;
  endPage?: number;
  countedPages: number;
}

export type XpReason = 'page' | 'stage_clear' | 'daily_quest' | 'book_clear';

export interface XpEvent {
  id: string;
  at: number;
  amount: number;
  reason: XpReason;
  bookId?: BookId;
  stageIndex?: number;
  page?: number;
  sessionId?: string;
}

export interface TrophyUnlock {
  trophyId: string;
  bookId?: BookId;
  at: number;
}

export interface Collection {
  id: string;
  name: string;
  smart?: 'papers' | 'books' | 'manuals';
  bookIds: BookId[];
}

/** Per-book reading totals derived from the sessions table. */
export interface BookStats {
  bookId: BookId;
  activeMs: number;
  sessions: number;
  lastSessionAt?: number;
}

export type GameIntensity = 'full' | 'light' | 'off';
export type GutterSize = 'wide' | 'narrow' | 'none';
export type DefaultFit = 'auto' | FitMode;
export type PageTransition = 'slide' | 'instant';

export interface Settings {
  folders: string[];
  includeSdCards: boolean;
  /** Scan and show the game manuals ES-DE downloads (off: they're skipped and hidden). */
  gameManuals: boolean;
  rescanOnLaunch: boolean;
  defaultFit: DefaultFit;
  gutters: GutterSize;
  autoCrop: boolean;
  pageTheme: PageTheme;
  pageTransition: PageTransition;
  zen: boolean;
  tateHand: 'left' | 'right';
  gameIntensity: GameIntensity;
  dailyGoal: number;
  xpModel: 'pages' | 'time';
  backGripKeys: { r4: string; l4: string; r5: string; l5: string };
  haptics: boolean;
  reduceMotion: boolean;
  /** Ask GitHub for a new version about once a day (the AppImage only). */
  checkUpdates: boolean;
  debugOverlay: boolean;
}
