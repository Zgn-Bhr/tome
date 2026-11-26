// Rectangles in page coordinates (PDF points at scale 1, y down).

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const boxW = (b: Box): number => b.x1 - b.x0;
export const boxH = (b: Box): number => b.y1 - b.y0;
export const fullPage = (w: number, h: number): Box => ({ x0: 0, y0: 0, x1: w, y1: h });

export function union(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  let { x0, y0, x1, y1 } = boxes[0]!;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  return { x0, y0, x1, y1 };
}

export function clampBox(b: Box, bounds: Box): Box {
  return {
    x0: Math.max(bounds.x0, b.x0),
    y0: Math.max(bounds.y0, b.y0),
    x1: Math.min(bounds.x1, b.x1),
    y1: Math.min(bounds.y1, b.y1),
  };
}

export function expand(b: Box, dx: number, dy = dx): Box {
  return { x0: b.x0 - dx, y0: b.y0 - dy, x1: b.x1 + dx, y1: b.y1 + dy };
}

/** True when `inner` lies inside `outer`, allowing `tol` overhang on each side. */
export function contains(outer: Box, inner: Box, tol = 0): boolean {
  return inner.x0 >= outer.x0 - tol && inner.y0 >= outer.y0 - tol && inner.x1 <= outer.x1 + tol && inner.y1 <= outer.y1 + tol;
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function medianBox(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  return {
    x0: median(boxes.map((b) => b.x0)),
    y0: median(boxes.map((b) => b.y0)),
    x1: median(boxes.map((b) => b.x1)),
    y1: median(boxes.map((b) => b.y1)),
  };
}
