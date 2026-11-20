// Trophies as data (spec §9.7): new ones need no UI changes.

export interface GameSnapshot {
  countedPagesTotal: number;
  streak: number;
  bestStreak: number;
  booksCleared: number;
  stagesCleared: number;
  bestSessionPages: number;
}

export interface BookSnapshot {
  pageCount: number;
  countedPages: number;
  stageCount: number;
  firstStageCleared: boolean;
  cleared: boolean;
}

export type TrophyIcon = 'calendar' | 'trophy' | 'book' | 'flame' | 'check';

interface Base {
  id: string;
  name: string;
  description: string;
  icon: TrophyIcon;
}

export interface GlobalTrophy extends Base {
  scope: 'global';
  progress(s: GameSnapshot): { current: number; target: number };
}

export interface BookTrophy extends Base {
  scope: 'book';
  describe?(b: BookSnapshot): string;
  progress(b: BookSnapshot): { current: number; target: number };
  /** Shows a bar and count ("18 / 50%") when locked. */
  measurable: boolean;
}

export const GLOBAL_TROPHIES: GlobalTrophy[] = [
  { id: 'first_page', scope: 'global', name: 'First Page', description: 'Read your first page', icon: 'book', progress: (s) => ({ current: Math.min(1, s.countedPagesTotal), target: 1 }) },
  { id: 'week_one', scope: 'global', name: 'Week One', description: 'Read 7 days in a row', icon: 'calendar', progress: (s) => ({ current: Math.min(7, s.bestStreak), target: 7 }) },
  { id: 'month_of_pages', scope: 'global', name: 'Month of Pages', description: 'Read 30 days in a row', icon: 'calendar', progress: (s) => ({ current: Math.min(30, s.bestStreak), target: 30 }) },
  { id: 'marathon', scope: 'global', name: 'Marathon', description: 'Read 50 pages in one session', icon: 'flame', progress: (s) => ({ current: Math.min(50, s.bestSessionPages), target: 50 }) },
  { id: 'bookworm_1', scope: 'global', name: 'Bookworm I', description: 'Clear a book', icon: 'trophy', progress: (s) => ({ current: Math.min(1, s.booksCleared), target: 1 }) },
  { id: 'bookworm_2', scope: 'global', name: 'Bookworm II', description: 'Clear 5 books', icon: 'trophy', progress: (s) => ({ current: Math.min(5, s.booksCleared), target: 5 }) },
  { id: 'bookworm_3', scope: 'global', name: 'Bookworm III', description: 'Clear 20 books', icon: 'trophy', progress: (s) => ({ current: Math.min(20, s.booksCleared), target: 20 }) },
  { id: 'stage_hunter', scope: 'global', name: 'Stage Hunter', description: 'Clear 25 stages', icon: 'check', progress: (s) => ({ current: Math.min(25, s.stagesCleared), target: 25 }) },
];

export const BOOK_TROPHIES: BookTrophy[] = [
  {
    id: 'first_steps',
    scope: 'book',
    name: 'First Steps',
    description: 'Clear the first stage',
    icon: 'check',
    measurable: false,
    progress: (b) => ({ current: b.firstStageCleared ? 1 : 0, target: 1 }),
  },
  {
    id: 'halfway',
    scope: 'book',
    name: 'Halfway There',
    description: "Read half of the book's pages",
    icon: 'book',
    measurable: true,
    progress: (b) => ({ current: b.pageCount ? Math.min(50, Math.floor((100 * b.countedPages) / b.pageCount)) : 0, target: 50 }),
  },
  {
    id: 'cover_to_cover',
    scope: 'book',
    name: 'Cover to Cover',
    description: 'Clear the book',
    icon: 'trophy',
    measurable: false,
    describe: (b) => `Clear all ${b.stageCount} stages`,
    progress: (b) => ({ current: b.cleared ? 1 : 0, target: 1 }),
  },
];

/** "Next trophy" on Home: the unearned global trophy with the highest current / target. */
export function nextTrophy(s: GameSnapshot, unlocked: ReadonlySet<string>): { trophy: GlobalTrophy; current: number; target: number } | undefined {
  let best: { trophy: GlobalTrophy; current: number; target: number } | undefined;
  for (const t of GLOBAL_TROPHIES) {
    if (unlocked.has(t.id)) continue;
    const p = t.progress(s);
    if (p.current >= p.target) continue;
    if (!best || p.current / p.target > best.current / best.target) best = { trophy: t, ...p };
  }
  return best;
}
