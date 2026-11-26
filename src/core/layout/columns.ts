// Two-column detection and reading order (spec §8.5).
//
// With a text layer: find a vertical gutter strip, centred between 35 % and
// 65 % of the content width and at least 1.5 % wide, that the fewest text
// boxes cross. Boxes that do cross it mark full-width bands (title, abstract,
// wide figures). The page is two-column only if the gutter stays clear over at
// least half of the content height.
//
// Without a text layer (scans): the same idea on an ink projection profile of
// a small greyscale render, binarised with Otsu's threshold.

import { boxH, boxW, type Box } from './box';

export interface ColumnLayout {
  /** Gutter x-range in page coordinates. */
  gutter: { x0: number; x1: number };
  /** Full-width bands (y-ranges) where content crosses the gutter. */
  bands: { y0: number; y1: number }[];
  /** Y-ranges that hold column text; column segments are trimmed to these. */
  columnRows?: { y0: number; y1: number }[];
}

export interface Segment {
  kind: 'band' | 'left' | 'right';
  box: Box;
}

const BINS = 200;
const MIN_GUTTER = 0.015;
const MIN_COLUMN_SHARE = 0.5;

/** Detect two columns from text item boxes inside `content`. */
export function detectColumnsFromText(items: readonly Box[], content: Box): ColumnLayout | null {
  const W = boxW(content);
  const H = boxH(content);
  if (W <= 0 || H <= 0) return null;
  const inside = items.filter((b) => b.x1 > content.x0 && b.x0 < content.x1 && b.y1 > content.y0 && b.y0 < content.y1 && boxW(b) > 0);
  if (inside.length < 20) return null;

  const counts = new Array<number>(BINS).fill(0);
  for (const b of inside) {
    const b0 = Math.max(0, Math.floor(((b.x0 - content.x0) / W) * BINS));
    const b1 = Math.min(BINS, Math.ceil(((b.x1 - content.x0) / W) * BINS));
    for (let i = b0; i < b1; i++) counts[i]!++;
  }
  const run = gutterRun(counts, Math.max(1, Math.round(0.02 * inside.length)));
  if (!run) return null;
  const gutter = { x0: content.x0 + (run.start / BINS) * W, x1: content.x0 + ((run.end + 1) / BINS) * W };
  return validate(
    inside.map((b) => ({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 })),
    gutter,
    content,
    W * 0.002,
    H * 0.012,
  );
}

/**
 * Longest low-count run whose centre lies in the middle 35–65 % and that is at
 * least 1.5 % wide. Low = within `tol` of the minimum count in the middle.
 */
function gutterRun(counts: readonly number[], tol: number): { start: number; end: number } | null {
  const n = counts.length;
  const lo = Math.floor(0.35 * n);
  const hi = Math.ceil(0.65 * n);
  let min = Infinity;
  for (let i = lo; i <= hi && i < n; i++) min = Math.min(min, counts[i]!);
  const thr = min + tol;
  let best: { start: number; end: number } | null = null;
  let i = 0;
  while (i < n) {
    if (counts[i]! > thr) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && counts[j + 1]! <= thr) j++;
    const centre = (i + j + 1) / 2;
    const wide = j - i + 1 >= Math.ceil(MIN_GUTTER * n);
    // A run touching either edge is a margin, not a gutter.
    if (wide && centre >= lo && centre <= hi && i > 0 && j < n - 1 && (!best || j - i > best.end - best.start)) best = { start: i, end: j };
    i = j + 1;
  }
  return best;
}

/** Bands from boxes crossing the gutter; reject layouts that aren't really two columns. */
function validate(boxes: readonly Box[], gutter: ColumnLayout['gutter'], content: Box, eps: number, gapY: number): ColumnLayout | null {
  const H = boxH(content);
  const crossing = boxes.filter((b) => b.x0 < gutter.x1 - eps && b.x1 > gutter.x0 + eps);
  const left = boxes.filter((b) => b.x1 <= gutter.x0 + eps);
  const right = boxes.filter((b) => b.x0 >= gutter.x1 - eps);
  if (left.length < 5 || right.length < 5 || crossing.length > 0.6 * boxes.length) return null;
  const columnMids = [...left, ...right].map((b) => (b.y0 + b.y1) / 2);
  const bands = joinEmptyGaps(
    mergeRanges(
      crossing.map((b) => ({ y0: Math.max(content.y0, b.y0), y1: Math.min(content.y1, b.y1) })),
      gapY,
    ),
    columnMids,
  );
  const bandH = bands.reduce((a, b) => a + (b.y1 - b.y0), 0);
  if (H - bandH < MIN_COLUMN_SHARE * H) return null;
  const extent = (list: readonly Box[]) => Math.max(...list.map((b) => b.y1)) - Math.min(...list.map((b) => b.y0));
  if (extent(left) < 0.25 * H || extent(right) < 0.25 * H) return null;
  const columnRows = mergeRanges([...left, ...right].map((b) => ({ y0: b.y0, y1: b.y1 })), gapY);
  return { gutter, bands, columnRows };
}

function mergeRanges(ranges: { y0: number; y1: number }[], gap: number): { y0: number; y1: number }[] {
  const sorted = ranges.filter((r) => r.y1 > r.y0).sort((a, b) => a.y0 - b.y0);
  const out: { y0: number; y1: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.y0 <= last.y1 + gap) last.y1 = Math.max(last.y1, r.y1);
    else out.push({ ...r });
  }
  return out;
}

/** Bands separated only by empty space (no column text between them) become one. */
function joinEmptyGaps(bands: { y0: number; y1: number }[], columnMids: readonly number[]): { y0: number; y1: number }[] {
  const out: { y0: number; y1: number }[] = [];
  for (const b of bands) {
    const last = out[out.length - 1];
    if (last && !columnMids.some((m) => m > last.y1 && m < b.y0)) last.y1 = b.y1;
    else out.push({ ...b });
  }
  return out;
}

/** Reading order: each band, then the left and right columns until the next band. */
export function columnSegments(layout: ColumnLayout, content: Box): Segment[] {
  const H = boxH(content);
  const minH = 0.015 * H;
  const segs: Segment[] = [];
  const cols = (a: number, b: number) => {
    let y0 = a;
    let y1 = b;
    // Only where column text actually is: no empty strips (e.g. crop padding above a band).
    if (layout.columnRows) {
      const hits = layout.columnRows.filter((r) => r.y1 > a && r.y0 < b);
      if (!hits.length) return;
      y0 = Math.max(a, Math.min(...hits.map((r) => r.y0)));
      y1 = Math.min(b, Math.max(...hits.map((r) => r.y1)));
    }
    if (y1 - y0 <= minH) return;
    segs.push({ kind: 'left', box: { x0: content.x0, y0, x1: layout.gutter.x0, y1 } });
    segs.push({ kind: 'right', box: { x0: layout.gutter.x1, y0, x1: content.x1, y1 } });
  };
  let y = content.y0;
  for (const b of [...layout.bands].sort((a, c) => a.y0 - c.y0)) {
    const y0 = Math.max(content.y0, b.y0);
    const y1 = Math.min(content.y1, b.y1);
    if (y1 <= y0) continue;
    cols(y, y0);
    segs.push({ kind: 'band', box: { x0: content.x0, y0, x1: content.x1, y1 } });
    y = y1;
  }
  cols(y, content.y1);
  return segs;
}

/** Otsu's threshold for a 256-bin histogram. */
export function otsu(hist: readonly number[]): number {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i] ?? 0;
    sum += i * (hist[i] ?? 0);
  }
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i] ?? 0;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * (hist[i] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = i;
    }
  }
  return thr;
}

export interface InkAnalysis {
  /** Ink bounding box, in fractions of the image (0..1). */
  content: Box | null;
  /** Column layout in fractions of the image, or null. */
  columns: ColumnLayout | null;
}

/** Scans: ink bounding box and two-column layout from a greyscale image (§8.5 step 2). */
export function analyseInk(gray: ArrayLike<number>, w: number, h: number): InkAnalysis {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < w * h; i++) hist[gray[i]! | 0]!++;
  const thr = otsu(hist);
  const ink = (x: number, y: number) => gray[y * w + x]! <= thr;

  const rows = new Array<number>(h).fill(0);
  const cols = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) {
    rows[y]!++;
    cols[x]!++;
  }
  const first = (a: number[], min: number) => a.findIndex((v) => v > min);
  const last = (a: number[], min: number) => a.length - 1 - [...a].reverse().findIndex((v) => v > min);
  const y0 = first(rows, 0.005 * w);
  const x0 = first(cols, 0.005 * h);
  if (y0 < 0 || x0 < 0) return { content: null, columns: null };
  const y1 = last(rows, 0.005 * w) + 1;
  const x1 = last(cols, 0.005 * h) + 1;
  const content: Box = { x0: x0 / w, y0: y0 / h, x1: x1 / w, y1: y1 / h };

  // Column profile inside the body region.
  const cw = x1 - x0;
  const profile = new Array<number>(cw).fill(0);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (ink(x, y)) profile[x - x0]!++;
  const run = gutterRun(profile, Math.max(1, Math.round(0.01 * (y1 - y0))));
  if (!run) return { content, columns: null };
  const gx0 = x0 + run.start;
  const gx1 = x0 + run.end + 1;

  // Rows whose ink crosses the gutter become bands.
  const crossRows: { y0: number; y1: number }[] = [];
  for (let y = y0; y < y1; y++) {
    let hit = false;
    for (let x = gx0; x < gx1 && !hit; x++) hit = ink(x, y);
    if (hit) crossRows.push({ y0: y, y1: y + 1 });
  }
  const bands = mergeRanges(crossRows, 0.012 * h);
  const bandH = bands.reduce((a, b) => a + (b.y1 - b.y0), 0);
  const sideRows: { y0: number; y1: number }[] = [];
  for (let y = y0; y < y1; y++) {
    let hit = false;
    for (let x = x0; x < gx0 && !hit; x++) hit = ink(x, y);
    for (let x = gx1; x < x1 && !hit; x++) hit = ink(x, y);
    if (hit) sideRows.push({ y0: y, y1: y + 1 });
  }
  const columnRows = mergeRanges(sideRows, 0.012 * h);
  const leftInk = profile.slice(0, run.start).some((v) => v > 0);
  const rightInk = profile.slice(run.end + 1).some((v) => v > 0);
  if (!leftInk || !rightInk || y1 - y0 - bandH < MIN_COLUMN_SHARE * (y1 - y0)) return { content, columns: null };
  return {
    content,
    columns: {
      gutter: { x0: gx0 / w, x1: gx1 / w },
      bands: bands.map((b) => ({ y0: b.y0 / h, y1: b.y1 / h })),
      columnRows: columnRows.map((r) => ({ y0: r.y0 / h, y1: r.y1 / h })),
    },
  };
}

/** Scale a layout from image fractions to page points. */
export function scaleLayout(l: ColumnLayout, pageW: number, pageH: number): ColumnLayout {
  return {
    gutter: { x0: l.gutter.x0 * pageW, x1: l.gutter.x1 * pageW },
    bands: l.bands.map((b) => ({ y0: b.y0 * pageH, y1: b.y1 * pageH })),
    ...(l.columnRows ? { columnRows: l.columnRows.map((r) => ({ y0: r.y0 * pageH, y1: r.y1 * pageH })) } : {}),
  };
}
