// Bookmarks list (§7.8): A jump, X delete, B close. Page thumbnails come later.

import { useMemo } from 'react';
import { columnGraph } from '../../core/input/focus';
import { stageForPage, stageTitle } from '../../core/stages/derive';
import { removeBookmark } from '../actions';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useApp } from '../store';
import { C } from '../tokens';
import { Dialog, MenuList } from '../components/Overlay';

const EMPTY: never[] = [];

export function BookmarksOverlay({ bookId, onJump, onClose }: { bookId: string; onJump: (page: number) => void; onClose: () => void }) {
  const bookmarks = useApp((s) => s.bookmarks[bookId]) ?? EMPTY;
  const stages = useApp((s) => s.stages[bookId]) ?? EMPTY;
  const ids = useMemo(() => bookmarks.map((b) => b.id), [bookmarks]);
  const graph = useMemo(() => columnGraph(ids), [ids]);
  const { focused, navigate } = useFocus(`bookmarks:${bookId}`, graph, ids[0]);
  const current = bookmarks.find((b) => b.id === focused);

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (navigate(e.action)) return;
      if (e.action === 'confirm' && current) onJump(current.page);
      if (e.action === 'secondary' && current) void removeBookmark(bookId, current.id);
      if (e.action === 'back') onClose();
    },
  });

  return (
    <Dialog
      title="BOOKMARKS"
      width={560}
      prompts={[
        ...(current
          ? [
              { glyphs: ['A' as const], label: 'Jump' },
              { glyphs: ['X' as const], label: 'Delete' },
            ]
          : []),
        { glyphs: ['B'], label: 'Close' },
      ]}
    >
      {bookmarks.length ? (
        <div style={{ maxHeight: 420, overflow: 'hidden' }}>
          <MenuList
            rows={bookmarks.map((b) => {
              const st = stageForPage(stages, b.page);
              return { id: b.id, label: `Page ${b.page}`, ...(st ? { hint: `Stage ${st.index + 1} · ${stageTitle(st)}` } : {}) };
            })}
            focused={focused}
          />
        </div>
      ) : (
        <span style={{ fontSize: 15, color: C.textMuted }}>No bookmarks yet. Press X while reading to add one.</span>
      )}
    </Dialog>
  );
}
