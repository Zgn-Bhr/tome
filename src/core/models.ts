// Data model (spec §4). Pure types, shared by every layer.

export type BookId = string; // sha1 of (file size + first 1 MiB)

export type BookKind = 'book' | 'paper';
export type StageSource = 'outline' | 'headings' | 'even';
export type PageTheme = 'paper' | 'sepia' | 'night' | 'dim';
export type FitMode = 'width' | 'page' | 'column';
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
  smart?: 'papers' | 'books';
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
  debugOverlay: boolean;
}
