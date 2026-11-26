// Auto-crop margins (spec §8.6): the content box is the union of the text
// boxes (or the ink bounding box for scans), padded by 2 % of the page width.
// To stop the page jumping in size, a book uses the median box of sampled
// pages, separately for odd and even pages, unless a page's own box sticks
// out of it (then that page uses the union of both).

import { clampBox, contains, expand, fullPage, medianBox, union, boxW, boxH, type Box } from './box';

export const CROP_PAD = 0.02;
/** Ignore crops that would keep less than this share of the page (likely junk). */
const MIN_AREA = 0.2;

export function contentBox(items: readonly Box[], pageW: number, pageH: number): Box | null {
  const page = fullPage(pageW, pageH);
  const inside = items.filter((b) => b.x1 > 0 && b.y1 > 0 && b.x0 < pageW && b.y0 < pageH && boxW(b) > 0);
  const u = union(inside);
  if (!u) return null;
  return clampBox(expand(u, CROP_PAD * pageW), page);
}

export interface BookCrop {
  odd: Box | null;
  even: Box | null;
}

/** Median content boxes of up to 10 odd and 10 even sample pages. */
export function bookCrop(samples: readonly { page: number; box: Box }[]): BookCrop {
  const odd = samples.filter((s) => s.page % 2 === 1).slice(0, 10).map((s) => s.box);
  const even = samples.filter((s) => s.page % 2 === 0).slice(0, 10).map((s) => s.box);
  return { odd: medianBox(odd), even: medianBox(even) };
}

/** The crop region for one page. Falls back to the whole page when unsure. */
export function cropForPage(own: Box | null, crop: BookCrop | null, page: number, pageW: number, pageH: number): Box {
  const full = fullPage(pageW, pageH);
  const med = crop ? (page % 2 === 1 ? crop.odd : crop.even) ?? crop.odd ?? crop.even : null;
  let box: Box | null;
  if (med && own) box = contains(med, own, 0.005 * pageW) ? med : union([med, own]);
  else box = med ?? own;
  if (!box) return full;
  box = clampBox(box, full);
  if (boxW(box) * boxH(box) < MIN_AREA * pageW * pageH || boxW(box) <= 0 || boxH(box) <= 0) return full;
  return box;
}
