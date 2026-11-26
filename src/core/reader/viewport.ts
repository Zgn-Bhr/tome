// Reader viewport math (spec §8.2–8.6): fit modes over a region of the page
// (the cropped content box, or one column segment), zoom about a point, and
// clamping scroll and pan. Pure, so the reader's geometry is testable.

import type { DefaultFit, FitMode } from '../models';
import { boxH, boxW, type Box } from '../layout/box';

export interface Size {
  w: number;
  h: number;
}

/** Scroll and pan in CSS px at the current display scale; zoom relative to fit. */
export interface ViewState {
  scrollY: number;
  panX: number;
  zoom: number;
}

export interface Layout {
  /** CSS px per PDF point. */
  ds: number;
  /** Region size on screen. */
  pw: number;
  ph: number;
  /** Region origin inside the viewport. */
  x: number;
  y: number;
  /** Page origin inside the viewport (the region's offset applied). */
  ox: number;
  oy: number;
  maxScroll: number;
  maxPan: number;
}

/** Margin around the page in fit-page mode (tate uses the same 20 px, §7.6). */
export const PAGE_MARGIN = 20;
/** Column mode fits the segment plus 24 px padding into the content area (§8.5). */
export const COLUMN_PAD = 24;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;

export const pageBox = (s: Size): Box => ({ x0: 0, y0: 0, x1: s.w, y1: s.h });

export function fitScale(region: Box, vp: Size, fit: FitMode, gutter: number): number {
  if (fit === 'page') return Math.min((vp.w - 2 * PAGE_MARGIN) / boxW(region), (vp.h - 2 * PAGE_MARGIN) / boxH(region));
  // Width, and Column (whose region is already the padded segment).
  return Math.max(1, vp.w - 2 * gutter) / boxW(region);
}

export function layout(region: Box, vp: Size, fit: FitMode, gutter: number, v: ViewState): Layout {
  const ds = fitScale(region, vp, fit, gutter) * v.zoom;
  const pw = boxW(region) * ds;
  const ph = boxH(region) * ds;
  const maxScroll = Math.max(0, ph - vp.h);
  const maxPan = Math.max(0, pw - vp.w);
  const x = pw <= vp.w ? (vp.w - pw) / 2 : 0 - clamp(v.panX, 0, maxPan);
  const y = ph <= vp.h ? (vp.h - ph) / 2 : 0 - clamp(v.scrollY, 0, maxScroll);
  return { ds, pw, ph, x, y, ox: x - region.x0 * ds, oy: y - region.y0 * ds, maxScroll, maxPan };
}

export function clampView(region: Box, vp: Size, fit: FitMode, gutter: number, v: ViewState): ViewState {
  const zoom = clamp(v.zoom, ZOOM_MIN, ZOOM_MAX);
  const l = layout(region, vp, fit, gutter, { ...v, zoom });
  return { zoom, scrollY: clamp(v.scrollY, 0, l.maxScroll), panX: clamp(v.panX, 0, l.maxPan) };
}

/** Change zoom while keeping the content point under `anchor` fixed on screen. */
export function zoomAbout(region: Box, vp: Size, fit: FitMode, gutter: number, v: ViewState, zoom: number, anchor: { x: number; y: number }): ViewState {
  const before = layout(region, vp, fit, gutter, v);
  const cx = (anchor.x - before.x) / before.ds;
  const cy = (anchor.y - before.y) / before.ds;
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  const ds = fitScale(region, vp, fit, gutter) * z;
  const next = { zoom: z, panX: cx * ds - anchor.x, scrollY: cy * ds - anchor.y };
  return clampView(region, vp, fit, gutter, next);
}

/** Scroll position as 0..1 of the scrollable range (what ReadingState stores). */
export function scrollFraction(l: Layout, v: ViewState): number {
  return l.maxScroll > 0 ? clamp(v.scrollY / l.maxScroll, 0, 1) : 0;
}

/**
 * The region shown for a column segment: the segment plus 24 px of padding at
 * the scale where it fills the content area. `width` lets left and right
 * columns share one scale.
 */
export function columnRegion(seg: Box, page: Size, vp: Size, gutter: number, width = boxW(seg)): Box {
  const ds = (vp.w - 2 * gutter - 2 * COLUMN_PAD) / width;
  const pad = COLUMN_PAD / ds;
  const cx = (seg.x0 + seg.x1) / 2;
  const half = width / 2 + pad;
  return {
    x0: Math.max(0, cx - half),
    x1: Math.min(page.w, cx + half),
    y0: Math.max(0, seg.y0 - pad),
    y1: Math.min(page.h, seg.y1 + pad),
  };
}

/** Default fit for a page (§11): Column for two-column, Page for landscape pages, else Width. */
export function autoFit(page: Size, setting: DefaultFit, isTwoColumn: boolean): FitMode {
  if (setting !== 'auto') return setting;
  if (page.w / page.h > 1.2) return 'page';
  return isTwoColumn ? 'column' : 'width';
}

/** View cycles Width → Page → Column (Column only when the page has columns). */
export function nextFit(fit: FitMode, hasColumns: boolean): FitMode {
  if (fit === 'width') return 'page';
  if (fit === 'page') return hasColumns ? 'column' : 'width';
  return 'width';
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
