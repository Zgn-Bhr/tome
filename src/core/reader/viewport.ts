// Reader viewport math (spec §8.2–8.4): fit modes, zoom about a point,
// clamping scroll and pan. Pure, so the reader's geometry is testable.

import type { DefaultFit, FitMode } from '../models';

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
  pw: number;
  ph: number;
  /** Page origin inside the viewport. */
  x: number;
  y: number;
  maxScroll: number;
  maxPan: number;
}

/** Margin around the page in fit-page mode (tate uses the same 20 px, §7.6). */
export const PAGE_MARGIN = 20;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;

export function fitScale(page: Size, vp: Size, fit: FitMode, gutter: number): number {
  if (fit === 'page') return Math.min((vp.w - 2 * PAGE_MARGIN) / page.w, (vp.h - 2 * PAGE_MARGIN) / page.h);
  // Width (and Column until column detection lands): content fills the viewport minus gutters.
  return Math.max(1, vp.w - 2 * gutter) / page.w;
}

export function layout(page: Size, vp: Size, fit: FitMode, gutter: number, v: ViewState): Layout {
  const ds = fitScale(page, vp, fit, gutter) * v.zoom;
  const pw = page.w * ds;
  const ph = page.h * ds;
  const maxScroll = Math.max(0, ph - vp.h);
  const maxPan = Math.max(0, pw - vp.w);
  const x = pw <= vp.w ? (vp.w - pw) / 2 : 0 - clamp(v.panX, 0, maxPan);
  const y = ph <= vp.h ? (vp.h - ph) / 2 : 0 - clamp(v.scrollY, 0, maxScroll);
  return { ds, pw, ph, x, y, maxScroll, maxPan };
}

export function clampView(page: Size, vp: Size, fit: FitMode, gutter: number, v: ViewState): ViewState {
  const zoom = clamp(v.zoom, ZOOM_MIN, ZOOM_MAX);
  const l = layout(page, vp, fit, gutter, { ...v, zoom });
  return { zoom, scrollY: clamp(v.scrollY, 0, l.maxScroll), panX: clamp(v.panX, 0, l.maxPan) };
}

/** Change zoom while keeping the content point under `anchor` fixed on screen. */
export function zoomAbout(page: Size, vp: Size, fit: FitMode, gutter: number, v: ViewState, zoom: number, anchor: { x: number; y: number }): ViewState {
  const before = layout(page, vp, fit, gutter, v);
  const cx = (anchor.x - before.x) / before.ds;
  const cy = (anchor.y - before.y) / before.ds;
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  const ds = fitScale(page, vp, fit, gutter) * z;
  const next = { zoom: z, panX: cx * ds - anchor.x, scrollY: cy * ds - anchor.y };
  return clampView(page, vp, fit, gutter, next);
}

/** Scroll position as 0..1 of the scrollable range (what ReadingState stores). */
export function scrollFraction(l: Layout, v: ViewState): number {
  return l.maxScroll > 0 ? clamp(v.scrollY / l.maxScroll, 0, 1) : 0;
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
