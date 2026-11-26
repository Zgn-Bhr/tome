// pdf.js wrapper: open, metadata, outline and text sampling (spec §8).

import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { OutlineEntry } from '../core/stages/derive';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

const assets = () => new URL('./pdfjs/', document.baseURI).href;

export class PdfPasswordError extends Error {}

export async function openPdf(url: string, password?: string): Promise<PDFDocumentProxy> {
  const base = assets();
  const task = pdfjs.getDocument({
    url,
    ...(password ? { password } : {}),
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
    enableHWA: true,
    enableXfa: false,
    rangeChunkSize: 256 * 1024,
  });
  try {
    return await task.promise;
  } catch (e) {
    if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PasswordException') {
      throw new PdfPasswordError('This PDF is password-protected');
    }
    throw e;
  }
}

/** Close a document and its worker-side resources. */
export function closePdf(doc: PDFDocumentProxy): void {
  void doc.loadingTask.destroy().catch(() => {});
}

export async function readMetadata(doc: PDFDocumentProxy): Promise<{ title?: string; author?: string }> {
  try {
    const { info } = (await doc.getMetadata()) as { info: Record<string, unknown> };
    const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
    const title = clean(info?.Title);
    const author = clean(info?.Author);
    // Ignore junk titles that are just a filename or a generator default.
    const usableTitle = title && !/\.(pdf|docx?|tex|indd|html?)$/i.test(title) && !/^(untitled|microsoft word)/i.test(title) ? title : undefined;
    return { ...(usableTitle ? { title: usableTitle } : {}), ...(author ? { author } : {}) };
  } catch {
    return {};
  }
}

async function resolveDest(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const ref = explicit[0];
    if (typeof ref === 'number' && Number.isInteger(ref)) return ref + 1;
    if (ref && typeof ref === 'object') return (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1;
    return null;
  } catch {
    return null; // invalid destinations are skipped (§13)
  }
}

/** Top two outline levels with resolved page numbers. */
export async function readOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[] | null> {
  let outline;
  try {
    outline = await doc.getOutline();
  } catch {
    return null;
  }
  if (!outline || outline.length === 0) return null;
  const top = outline.slice(0, 400);
  return Promise.all(
    top.map(async (item) => ({
      title: item.title ?? '',
      page: await resolveDest(doc, item.dest),
      children: await Promise.all(
        (item.items ?? []).slice(0, 200).map(async (c) => ({ title: c.title ?? '', page: await resolveDest(doc, c.dest), children: [] })),
      ),
    })),
  );
}

export interface PageText {
  words: number;
  chars: number;
  lines: string[];
}

export async function pageText(page: PDFPageProxy): Promise<PageText> {
  const content = await page.getTextContent();
  let words = 0;
  let chars = 0;
  const lines: string[] = [];
  let line = '';
  for (const it of content.items) {
    if (!('str' in it)) continue;
    const s = it.str;
    chars += s.length;
    words += s.split(/\s+/).filter(Boolean).length;
    line += s;
    if (it.hasEOL) {
      lines.push(line.trim());
      line = '';
    }
  }
  if (line.trim()) lines.push(line.trim());
  return { words, chars, lines };
}

const PAPER_HEADING = /^(\d+\.?\s*)?(abstract|references|bibliography)\b/i;

/** Sample a few pages for a text layer and paper-style headings (§7.2 heuristic). */
export async function sampleText(doc: PDFDocumentProxy): Promise<{ hasTextLayer: boolean; hasPaperHeading: boolean }> {
  const n = doc.numPages;
  const pages = [...new Set([1, 2, n - 2, n - 1, n].filter((p) => p >= 1 && p <= n))];
  let chars = 0;
  let heading = false;
  for (const p of pages) {
    try {
      const page = await doc.getPage(p);
      const t = await pageText(page);
      chars += t.chars;
      if (t.lines.some((l) => l.length < 60 && PAPER_HEADING.test(l))) heading = true;
      page.cleanup();
    } catch {
      /* unreadable page: ignore */
    }
  }
  return { hasTextLayer: chars > 40, hasPaperHeading: heading };
}

/** Page size in PDF points at scale 1, honouring /Rotate. */
export function pageSize(page: PDFPageProxy): { w: number; h: number } {
  const vp = page.getViewport({ scale: 1 });
  return { w: vp.width, h: vp.height };
}

/**
 * Cover thumbnail (§7.9): page 1 fitted into a 148:208 box at 2×, leftover
 * filled with the average edge colour of the page. Returns WebP bytes.
 */
export async function renderCover(doc: PDFDocumentProxy, boxW = 296, boxH = 416): Promise<Uint8Array> {
  const page = await doc.getPage(1);
  const { w, h } = pageSize(page);
  const scale = Math.min(boxW / w, boxH / h);
  const vp = page.getViewport({ scale });
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(vp.width));
  tmp.height = Math.max(1, Math.round(vp.height));
  const tctx = tmp.getContext('2d', { willReadFrequently: true })!;
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, tmp.width, tmp.height);
  await page.render({ canvas: tmp, viewport: vp }).promise;

  const out = document.createElement('canvas');
  out.width = boxW;
  out.height = boxH;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = edgeColour(tctx, tmp.width, tmp.height);
  ctx.fillRect(0, 0, boxW, boxH);
  ctx.drawImage(tmp, Math.round((boxW - tmp.width) / 2), Math.round((boxH - tmp.height) / 2));
  page.cleanup();

  const blob = await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.86));
  return new Uint8Array(await blob.arrayBuffer());
}

function edgeColour(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  const strips = [ctx.getImageData(0, 0, w, 2), ctx.getImageData(0, h - 2, w, 2), ctx.getImageData(0, 0, 2, h), ctx.getImageData(w - 2, 0, 2, h)];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const s of strips) {
    for (let i = 0; i < s.data.length; i += 4) {
      r += s.data[i]!;
      g += s.data[i + 1]!;
      b += s.data[i + 2]!;
      n++;
    }
  }
  return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : '#ffffff';
}
