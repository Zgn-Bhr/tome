// Screen stack (spec §5). Each screen remembers its own focus (useFocus).

import { createContext, useContext } from 'react';
import type { Tab } from './components/Header';
import type { SessionSummary } from './screens/SessionComplete';

export type Route =
  | { name: 'library'; tab: Tab; openSort?: boolean }
  | { name: 'details'; bookId: string }
  | { name: 'reader'; bookId: string; jumpTo?: number }
  | { name: 'session'; summary: SessionSummary };

export interface Nav {
  stack: Route[];
  push(r: Route): void;
  pop(): void;
  replace(r: Route): void;
  openBook(bookId: string, jumpTo?: number): void;
  openDetails(bookId: string): void;
  showQuit(): void;
  showSettings(): void;
  showFolderPicker(): void;
}

export const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavCtx missing');
  return n;
}
