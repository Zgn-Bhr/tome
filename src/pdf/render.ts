// Page rendering (spec §8.1): page → ImageBitmap at a scale, a small LRU
// cache, idle prerendering of neighbours, and viewport-sized detail renders
// for deep zoom.

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { closePdf, pageSize } from './document';

export interface Rendered {
  bitmap: ImageBitmap;
  /** Device pixels per PDF point. */
  scale: number;
  page: number;
}

/** Largest bitmap we render for a whole page (device px). Beyond it, detail renders fill in. */
export const MAX_PAGE_PIXELS = 4096 * 4096;
/** Room for the current, next and previous view in Two pages (2 bitmaps each), plus a spare. */
const CACHE_SIZE = 8;

export class PageRenderer {
  private pages = new Map<number, Promise<PDFPageProxy>>();
  private sizes = new Map<number, { w: number; h: number }>();
  private cache = new Map<string, Rendered>();
  private inflight = new Map<string, Promise<Rendered>>();
  private destroyed = false;

  constructor(readonly doc: PDFDocumentProxy) {}

  get pageCount(): number {
    return this.doc.numPages;
  }

  page(n: number): Promise<PDFPageProxy> {
    let p = this.pages.get(n);
    if (!p) {
      p = this.doc.getPage(n);
      this.pages.set(n, p);
    }
    return p;
  }

  async size(n: number): Promise<{ w: number; h: number }> {
    const known = this.sizes.get(n);
    if (known) return known;
    const s = pageSize(await this.page(n));
    this.sizes.set(n, s);
    return s;
  }

  sizeIfKnown(n: number): { w: number; h: number } | undefined {
    return this.sizes.get(n);
  }

  /** Clamp a requested scale so the bitmap stays within MAX_PAGE_PIXELS. */
  static capScale(size: { w: number; h: number }, scale: number): number {
    const px = size.w * size.h * scale * scale;
    return px > MAX_PAGE_PIXELS ? Math.sqrt(MAX_PAGE_PIXELS / (size.w * size.h)) : scale;
  }

  cached(n: number, scale: number): Rendered | undefined {
    const key = keyOf(n, scale);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
    }
    return hit;
  }

  /** Any cached bitmap of page `n`, best scale first (a placeholder while rendering). */
  anyCached(n: number): Rendered | undefined {
    let best: Rendered | undefined;
    for (const r of this.cache.values()) if (r.page === n && (!best || r.scale > best.scale)) best = r;
    return best;
  }

  /** Render page `n` at `scale`. `cache: false` is for throwaway low-res previews. */
  render(n: number, scale: number, opts: { cache?: boolean } = {}): Promise<Rendered> {
    const useCache = opts.cache !== false;
    const key = keyOf(n, scale) + (useCache ? '' : ':tmp');
    const hit = useCache ? this.cached(n, scale) : undefined;
    if (hit) return Promise.resolve(hit);
    const running = this.inflight.get(key);
    if (running) return running;
    const job = (async () => {
      const page = await this.page(n);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport: vp }).promise;
      const bitmap = await createImageBitmap(canvas);
      canvas.width = canvas.height = 0; // release the backing store now
      const r: Rendered = { bitmap, scale, page: n };
      if (this.destroyed) {
        bitmap.close();
        throw new Error('renderer destroyed');
      }
      if (useCache) this.store(key, r);
      return r;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  /** Render a device-pixel rectangle of page `n` at `scale` (deep-zoom detail). */
  async renderRegion(n: number, scale: number, rect: { x: number; y: number; w: number; h: number }): Promise<ImageBitmap> {
    const page = await this.page(n);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(rect.w));
    canvas.height = Math.max(1, Math.floor(rect.h));
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport: vp, transform: [1, 0, 0, 1, -rect.x, -rect.y] }).promise;
    const bitmap = await createImageBitmap(canvas);
    canvas.width = canvas.height = 0;
    return bitmap;
  }

  private store(key: string, r: Rendered): void {
    this.cache.set(key, r);
    while (this.cache.size > CACHE_SIZE) {
      const [oldKey, old] = this.cache.entries().next().value as [string, Rendered];
      this.cache.delete(oldKey);
      old.bitmap.close();
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const r of this.cache.values()) r.bitmap.close();
    this.cache.clear();
    closePdf(this.doc);
  }
}

function keyOf(n: number, scale: number): string {
  return `${n}@${scale.toFixed(4)}`;
}
