// Display menu (§7.8): a 360 px right-side sheet. ←/→ change values in place.

import { useMemo } from 'react';
import type { FitMode, PageTheme } from '../../../core/models';
import { columnGraph } from '../../../core/input/focus';
import { FIT_LABEL } from '../../../core/reader/viewport';
import { updateSettings } from '../../actions';
import { useInput } from '../../input/InputProvider';
import { useFocus } from '../../focus/useFocus';
import { useApp } from '../../store';
import { MenuList, Sheet, type MenuRow } from '../../components/Overlay';

const THEMES: PageTheme[] = ['paper', 'sepia', 'night', 'dim'];
const FITS: FitMode[] = ['width', 'page', 'spread', 'column'];
const GUTTERS = ['wide', 'narrow', 'none'] as const;

const FIT_HINT: Partial<Record<FitMode, string>> = {
  column: 'Column: read one column at a time',
  spread: 'Facing pages, edge to edge',
};

export function DisplaySheet({
  theme,
  fit,
  hasColumns,
  spreadCover,
  bookOnly,
  onTheme,
  onBookOnly,
  onFit,
  onSpreadCover,
  onClose,
}: {
  theme: PageTheme;
  fit: FitMode;
  /** Column fit is offered only when the page has columns (§8.3). */
  hasColumns: boolean;
  /** Two pages: page 1 stands alone (this book). */
  spreadCover: boolean;
  bookOnly: boolean;
  onTheme: (t: PageTheme, bookOnly: boolean) => void;
  onBookOnly: (on: boolean) => void;
  onFit: (f: FitMode) => void;
  onSpreadCover: (on: boolean) => void;
  onClose: () => void;
}) {
  const gutters = useApp((s) => s.settings.gutters);
  const zen = useApp((s) => s.settings.zen);
  const autoCrop = useApp((s) => s.settings.autoCrop);
  const fits = hasColumns ? FITS : FITS.filter((f) => f !== 'column');
  const spread = fit === 'spread';
  // "Cover page alone" only matters in Two pages, so it appears right under Fit then.
  const ids = useMemo(
    () => ['theme', 'bookOnly', 'fit', ...(spread ? ['cover'] : []), 'autoCrop', 'gutters', 'zen', 'done'],
    [spread],
  );
  const graph = useMemo(() => columnGraph(ids), [ids]);
  const { focused, navigate } = useFocus('display-sheet', graph, 'theme');

  const cycle = <T,>(list: readonly T[], cur: T, d: number): T => list[(list.indexOf(cur) + d + list.length) % list.length]!;
  const change = (d: 1 | -1) => {
    switch (focused) {
      case 'theme':
        return onTheme(cycle(THEMES, theme, d), bookOnly);
      case 'bookOnly':
        return onBookOnly(!bookOnly);
      case 'fit':
        return onFit(cycle(fits, fits.includes(fit) ? fit : 'width', d));
      case 'cover':
        return onSpreadCover(!spreadCover);
      case 'autoCrop':
        return void updateSettings({ autoCrop: !autoCrop });
      case 'gutters':
        return void updateSettings({ gutters: cycle(GUTTERS, gutters, d) });
      case 'zen':
        return void updateSettings({ zen: !zen });
    }
  };

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (e.action === 'nav_left') return change(-1);
      if (e.action === 'nav_right') return change(1);
      if (navigate(e.action)) return;
      if (e.action === 'confirm') return focused === 'done' ? onClose() : change(1);
      if (e.action === 'back' || e.action === 'menu') onClose();
    },
  });

  const all: Record<string, MenuRow> = {
    theme: { id: 'theme', label: 'Page theme', value: theme.toUpperCase(), ...(theme === 'night' ? { hint: 'Inverts figures too — try Dim for figure-heavy PDFs' } : {}) },
    bookOnly: { id: 'bookOnly', label: 'Apply to this book only', value: bookOnly ? 'ON' : 'OFF' },
    fit: { id: 'fit', label: 'Fit', value: FIT_LABEL[fit], ...(FIT_HINT[fit] ? { hint: FIT_HINT[fit] } : hasColumns ? { hint: FIT_HINT.column! } : {}) },
    cover: {
      id: 'cover',
      label: 'Cover page alone',
      value: spreadCover ? 'ON' : 'OFF',
      hint: spreadCover ? 'This book: 1 | 2–3 | 4–5' : 'This book: 1–2 | 3–4',
    },
    autoCrop: { id: 'autoCrop', label: 'Auto-crop margins', value: autoCrop ? 'ON' : 'OFF', ...(spread ? { hint: 'Two pages always show whole pages' } : {}) },
    gutters: { id: 'gutters', label: 'Gutters', value: gutters.toUpperCase() },
    zen: { id: 'zen', label: 'Zen (hide counter and line)', value: zen ? 'ON' : 'OFF' },
    done: { id: 'done', label: 'Back to reading' },
  };

  return (
    <Sheet
      title="DISPLAY"
      prompts={[
        { glyphs: ['Dpad'], label: 'Change' },
        { glyphs: ['B'], label: 'Close' },
      ]}
    >
      <MenuList rows={ids.map((id) => all[id]!)} focused={focused} />
    </Sheet>
  );
}
