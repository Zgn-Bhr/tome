// Book-level layout analysis, run once during background indexing (§8.5, §8.6, §9.5).

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Box } from '../core/layout/box';
import { bookCrop, type BookCrop } from '../core/layout/crop';
import { detectHeadings, type TextLine } from '../core/layout/headings';
import type { OutlineEntry } from '../core/stages/derive';
import { hasText, pageContentBox, readPageInk, readPageText, textColumns, type PageText } from './layout';

/** Bump when the analysis changes, so already-indexed books are re-analysed. */
export const LAYOUT_VERSION = 1;

const PAPER_HEADING = /^(\d+\.?\s*)?(abstract|references|bibliography)\b/i;
const MAX_HEADING_SCAN = 600;

export interface BookAnalysis {
  hasTextLayer: boolean;
  hasPaperHeading: boolean;
  isTwoColumn: boolean;
  crop: BookCrop | null;
  headings: OutlineEntry[] | null;
}

/** Up to `n` page numbers spread evenly through the book. */
function spread(pageCount: number, n: number): number[] {
  if (pageCount <= n) return Array.from({ length: pageCount }, (_, i) => i + 1);
  return [...new Set(Array.from({ length: n }, (_, i) => 1 + Math.round((i * (pageCount - 1)) / (n - 1))))];
}

export async function analyseBook(doc: PDFDocumentProxy, needHeadings: boolean): Promise<BookAnalysis> {
  const n = doc.numPages;
  const texts = new Map<number, PageText>();
  const read = async (p: number): Promise<PageText | null> => {
    const cached = texts.get(p);
    if (cached) return cached;
    try {
      const page = await doc.getPage(p);
      const t = await readPageText(page, p);
      page.cleanup();
      texts.set(p, t);
      return t;
    } catch {
      return null;
    }
  };

  // Samples for the crop medians (10 odd + 10 even) and the column vote.
  const samples = spread(n, 20);
  for (const p of samples) await read(p);
  const sampled = samples.map((p) => texts.get(p)).filter((t): t is PageText => !!t);
  const textPages = sampled.filter(hasText);
  const hasTextLayer = sampled.length > 0 && textPages.length >= sampled.length / 2;

  let crop: BookCrop | null = null;
  let twoCol = 0;
  let considered = 0;
  const body = samples.filter((p) => p > 1 || n === 1).slice(0, 10);

  if (hasTextLayer) {
    const boxes: { page: number; box: Box }[] = [];
    for (const p of samples) {
      const t = texts.get(p);
      const box = t && hasText(t) ? pageContentBox(t) : null;
      if (box) boxes.push({ page: p, box });
    }
    crop = boxes.length ? bookCrop(boxes) : null;
    for (const p of body) {
      const t = texts.get(p);
      if (!t || !hasText(t)) continue;
      const content = pageContentBox(t);
      if (!content) continue;
      considered++;
      if (textColumns(t, content)) twoCol++;
    }
  } else {
    // Scans: a few small renders for the ink box and columns.
    const boxes: { page: number; box: Box }[] = [];
    for (const p of body.slice(0, 6)) {
      try {
        const page = await doc.getPage(p);
        const ink = await readPageInk(page);
        page.cleanup();
        if (ink.crop) boxes.push({ page: p, box: ink.crop });
        considered++;
        if (ink.columns) twoCol++;
      } catch {
        /* unreadable page */
      }
    }
    crop = boxes.length ? bookCrop(boxes) : null;
  }

  // Paper heuristic (§7.2): an Abstract or References heading near either end.
  let hasPaperHeading = false;
  for (const p of [...new Set([1, 2, n - 2, n - 1, n].filter((x) => x >= 1 && x <= n))]) {
    const t = await read(p);
    if (t?.lines.some((l) => l.text.length < 60 && PAPER_HEADING.test(l.text))) hasPaperHeading = true;
  }

  let headings: OutlineEntry[] | null = null;
  if (needHeadings && hasTextLayer && n <= MAX_HEADING_SCAN) {
    const lines: TextLine[] = [];
    for (let p = 1; p <= n; p++) {
      const t = await read(p);
      if (t) lines.push(...t.lines);
      if (p % 25 === 0) await new Promise((r) => setTimeout(r, 0)); // stay responsive
    }
    headings = detectHeadings(lines);
  }

  return { hasTextLayer, hasPaperHeading, isTwoColumn: considered > 0 && twoCol / considered >= 0.6, crop, headings };
}
