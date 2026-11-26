// Explicit focus graphs (spec §6.6). Each screen declares node ids and their
// up/down/left/right neighbours; grids and rows generate theirs.

export type Dir = 'up' | 'down' | 'left' | 'right';

export type FocusNode = Partial<Record<Dir, string>>;
export type FocusGraph = Record<string, FocusNode>;

export function move(graph: FocusGraph, current: string, dir: Dir): string | null {
  const next = graph[current]?.[dir];
  return next && next in graph ? next : null;
}

/** Horizontal row: left/right links. */
export function rowGraph(ids: readonly string[]): FocusGraph {
  const g: FocusGraph = {};
  ids.forEach((id, i) => {
    g[id] = {
      ...(i > 0 ? { left: ids[i - 1] } : {}),
      ...(i < ids.length - 1 ? { right: ids[i + 1] } : {}),
    };
  });
  return g;
}

/** Vertical column: up/down links. */
export function columnGraph(ids: readonly string[]): FocusGraph {
  const g: FocusGraph = {};
  ids.forEach((id, i) => {
    g[id] = {
      ...(i > 0 ? { up: ids[i - 1] } : {}),
      ...(i < ids.length - 1 ? { down: ids[i + 1] } : {}),
    };
  });
  return g;
}

/**
 * Grid in reading order with `cols` columns. Down from the last full row goes
 * to the last item when the final row is short.
 */
export function gridGraph(ids: readonly string[], cols: number): FocusGraph {
  const g: FocusGraph = {};
  const n = ids.length;
  ids.forEach((id, i) => {
    const col = i % cols;
    const node: FocusNode = {};
    if (col > 0) node.left = ids[i - 1];
    if (col < cols - 1 && i + 1 < n) node.right = ids[i + 1];
    if (i - cols >= 0) node.up = ids[i - cols];
    if (i + cols < n) node.down = ids[i + cols];
    else if (Math.floor(i / cols) < Math.floor((n - 1) / cols)) node.down = ids[n - 1];
    g[id] = node;
  });
  return g;
}

/** Rows of different lengths: left/right within a row, up/down keep the column (clamped). */
export function rowsGraph(rows: readonly (readonly string[])[]): FocusGraph {
  const g: FocusGraph = {};
  const live = rows.filter((r) => r.length > 0);
  live.forEach((row, r) => {
    row.forEach((id, c) => {
      const above = live[r - 1];
      const below = live[r + 1];
      g[id] = {
        ...(c > 0 ? { left: row[c - 1]! } : {}),
        ...(c < row.length - 1 ? { right: row[c + 1]! } : {}),
        ...(above ? { up: above[Math.min(c, above.length - 1)]! } : {}),
        ...(below ? { down: below[Math.min(c, below.length - 1)]! } : {}),
      };
    });
  });
  return g;
}

/** Merge graphs; later links override earlier ones per direction. */
export function mergeGraphs(...graphs: FocusGraph[]): FocusGraph {
  const out: FocusGraph = {};
  for (const g of graphs) {
    for (const [id, node] of Object.entries(g)) out[id] = { ...out[id], ...node };
  }
  return out;
}

/** Add a one-way link. */
export function link(graph: FocusGraph, from: string, dir: Dir, to: string): FocusGraph {
  return { ...graph, [from]: { ...graph[from], [dir]: to } };
}

/**
 * Serpentine stage map (§7.3): rows of `perRow`, odd rows reversed on screen.
 * D-pad moves by screen position, so "right" on a reversed row goes to the
 * node drawn to the right (the previous stage).
 */
export function serpentineGraph(ids: readonly string[], perRow: number): FocusGraph {
  const g: FocusGraph = {};
  const rows = Math.ceil(ids.length / perRow);
  const at = (row: number, screenCol: number): string | undefined => {
    if (row < 0 || row >= rows || screenCol < 0 || screenCol >= perRow) return undefined;
    const idx = row * perRow + (row % 2 === 0 ? screenCol : perRow - 1 - screenCol);
    return ids[idx];
  };
  ids.forEach((id, i) => {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    const screenCol = row % 2 === 0 ? inRow : perRow - 1 - inRow;
    const node: FocusNode = {};
    const l = at(row, screenCol - 1);
    const r = at(row, screenCol + 1);
    if (l) node.left = l;
    if (r) node.right = r;
    let u = at(row - 1, screenCol);
    let d = at(row + 1, screenCol);
    // Short last row: fall back to the nearest node in that row.
    if (!d && row + 1 < rows) d = ids[ids.length - 1];
    if (!u && row > 0) u = ids[(row - 1) * perRow];
    if (u) node.up = u;
    if (d) node.down = d;
    g[id] = node;
  });
  return g;
}
