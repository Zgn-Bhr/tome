// Page layout facts from pdf.js: text boxes and lines (for auto-crop, column
// detection, headings and word counts), or an ink analysis for scans.

import type { PDFPageProxy } from 'pdfjs-dist';
import type { Box } from '../core/layout/box';
import type { TextLine } from '../core/layout/headings';
import { analyseInk, columnSegments, detectColumnsFromText, scaleLayout, type ColumnLayout, type Segment } from '../core/layout/columns';
import { contentBox } from '../core/layout/crop';
import { pageSize } from './document';

export interface PageText {
  w: number;
  h: number;
  /** Text item boxes in page points (y down). */
  items: Box[];
  lines: TextLine[];
  words: number;
  chars: number;
}

/** Text boxes and lines for one page, in viewport coordinates at scale 1. */
export async function readPageText(page: PDFPageProxy, pageNum: number): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: Box[] = [];
  const lines: TextLine[] = [];
  let words = 0;
  let chars = 0;
  let line: { text: string; size: number; y: number; base: number } | null = null;
  const flush = () => {
    if (line && line.text.trim()) lines.push({ page: pageNum, text: line.text.trim(), size: line.size, y: line.y / vp.height });
    line = null;
  };
  for (const it of content.items) {
    if (!('str' in it)) continue;
    const s = it.str;
    chars += s.length;
    words += s.split(/\s+/).filter(Boolean).length;
    if (!s.trim() || !it.width) {
      if (it.hasEOL) flush();
      continue;
    }
    const [, , c, d, e, f] = it.transform as number[];
    const size = Math.hypot(c ?? 0, d ?? 0) || it.height || 10;
    const [ax, ay] = vp.convertToViewportPoint(e!, f! - size * 0.2) as [number, number];
    const [bx, by] = vp.convertToViewportPoint(e! + it.width, f! + size * 0.8) as [number, number];
    const box: Box = { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
    items.push(box);
    // Group items into lines by baseline.
    if (line && Math.abs(box.y0 - line.base) > size * 0.5) flush();
    if (!line) line = { text: '', size, y: box.y0, base: box.y0 };
    line.text += (line.text && !/\s$/.test(line.text) && !/^\s/.test(s) ? ' ' : '') + s;
    line.size = Math.max(line.size, size);
    if (it.hasEOL) flush();
  }
  flush();
  return { w: vp.width, h: vp.height, items, lines, words, chars };
}

export const hasText = (t: PageText) => t.chars >= 20;

/** Scans: render a small greyscale copy and analyse its ink (§8.5 step 2, §8.6). */
export async function readPageInk(page: PDFPageProxy): Promise<{ crop: Box | null; columns: ColumnLayout | null; w: number; h: number }> {
  const { w, h } = pageSize(page);
  const scale = 300 / w;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport: vp }).promise;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114) | 0;
  const a = analyseInk(gray, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
  const crop = a.content ? { x0: (a.content.x0 - 0.02) * w, y0: a.content.y0 * h - 0.02 * w, x1: (a.content.x1 + 0.02) * w, y1: a.content.y1 * h + 0.02 * w } : null;
  return { crop, columns: a.columns ? scaleLayout(a.columns, w, h) : null, w, h };
}

/** Column segments for a page from its text (or null when it isn't two-column). */
export function textColumns(t: PageText, content: Box): Segment[] | null {
  const layout = detectColumnsFromText(t.items, content);
  return layout ? columnSegments(layout, content) : null;
}

export function pageContentBox(t: PageText): Box | null {
  return contentBox(t.items, t.w, t.h);
}
