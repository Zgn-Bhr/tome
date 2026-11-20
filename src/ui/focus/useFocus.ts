// Screen-level focus bound to an explicit graph (§6.6). Each screen key
// remembers its last focused node, so coming back restores focus there.

import { useCallback, useEffect, useState } from 'react';
import { move, type Dir, type FocusGraph } from '../../core/input/focus';
import type { Action } from '../../core/input/actions';

const memory = new Map<string, string>();

export function forgetFocus(screenKey: string): void {
  memory.delete(screenKey);
}

export const NAV_DIRS: Partial<Record<Action, Dir>> = {
  nav_up: 'up',
  nav_down: 'down',
  nav_left: 'left',
  nav_right: 'right',
};

export function useFocus(screenKey: string, graph: FocusGraph, initial: string | undefined) {
  const pick = useCallback(
    (preferred?: string) => {
      if (preferred && preferred in graph) return preferred;
      const remembered = memory.get(screenKey);
      if (remembered && remembered in graph) return remembered;
      if (initial && initial in graph) return initial;
      return Object.keys(graph)[0] ?? '';
    },
    [graph, initial, screenKey],
  );

  const [focused, setFocusedState] = useState(() => pick());

  // Keep focus valid when the graph changes (e.g. a filter empties the grid).
  useEffect(() => {
    if (!(focused in graph)) setFocusedState(pick());
  }, [graph, focused, pick]);

  const setFocused = useCallback(
    (id: string) => {
      memory.set(screenKey, id);
      setFocusedState(id);
    },
    [screenKey],
  );

  useEffect(() => {
    if (focused) memory.set(screenKey, focused);
  }, [focused, screenKey]);

  /** Handle a nav action; returns true if focus moved or the action was a nav. */
  const navigate = useCallback(
    (action: Action): boolean => {
      const dir = NAV_DIRS[action];
      if (!dir) return false;
      const next = move(graph, focused, dir);
      if (next) setFocused(next);
      return true;
    },
    [graph, focused, setFocused],
  );

  return { focused, setFocused, navigate };
}
