// Heading-based stages (spec §9.5 step 2): when there's no usable outline but
// a text layer, find lines whose font size is ≥ 1.2× the median body size or
// that match common section names. Use them if 3–40 are found.

import { median } from './box';
import type { OutlineEntry } from '../stages/derive';

export interface TextLine {
  page: number;
  text: string;
  /** Font size in points. */
  size: number;
  /** Top of the line as a fraction of the page height. */
  y: number;
}

export const SECTION_NAME =
  /^(?:(?:\d+|[IVX]+)(?:\.\d+)*\.?\s+)?(abstract|introduction|background|results|discussion|conclusions?|methods|materials and methods|references|acknowledge?ments|supplementary(?: [a-z]+)*)\.?:?$/i;

const MIN_HEADINGS = 3;
const MAX_HEADINGS = 40;

/** Body font size: the median size weighted by how much text uses it. */
export function bodySize(lines: readonly TextLine[]): number {
  const weighted: number[] = [];
  for (const l of lines) {
    const n = Math.min(200, Math.max(1, Math.round(l.text.length / 10)));
    for (let i = 0; i < n; i++) weighted.push(l.size);
  }
  return weighted.length ? median(weighted) : 0;
}

export function detectHeadings(lines: readonly TextLine[]): OutlineEntry[] | null {
  const body = bodySize(lines);
  if (!body) return null;
  const clean = (t: string) => t.replace(/\s+/g, ' ').trim();
  const key = (t: string) => clean(t).toLowerCase().replace(/[^a-z]/g, '');

  const candidates = lines
    .map((l) => ({ ...l, text: clean(l.text) }))
    .filter((l) => l.y > 0.06 && l.y < 0.94) // running headers and footers live at the edges
    .filter((l) => l.text.length >= 2 && l.text.length <= 80 && /[A-Za-z]{2}/.test(l.text))
    .map((l) => ({ ...l, section: SECTION_NAME.test(l.text) }))
    .filter((l) => l.section || l.size >= 1.2 * body);

  // A big line repeated on many pages is a running header, not a heading.
  const pagesByText = new Map<string, Set<number>>();
  for (const c of candidates) {
    const k = key(c.text);
    if (!pagesByText.has(k)) pagesByText.set(k, new Set());
    pagesByText.get(k)!.add(c.page);
  }
  const kept = candidates.filter((c) => c.section || (pagesByText.get(key(c.text))?.size ?? 0) <= 3);

  // One heading per page: a section name wins, else the first big line.
  const perPage = new Map<number, (typeof kept)[number]>();
  for (const c of kept) {
    const cur = perPage.get(c.page);
    if (!cur || (c.section && !cur.section) || (c.section === cur.section && c.y < cur.y)) perPage.set(c.page, c);
  }
  const entries = [...perPage.values()].sort((a, b) => a.page - b.page);
  if (entries.length < MIN_HEADINGS || entries.length > MAX_HEADINGS) return null;
  return entries.map((e) => ({ title: e.text, page: e.page, children: [] }));
}
