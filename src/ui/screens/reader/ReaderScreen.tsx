// Reader (§7.4 focus mode, §7.5 HUD, §8 engine).
//
// One page at a time with vertical scrolling inside it (§8.2). The page is a
// canvas holding a themed bitmap; scrolling, panning and live zoom only
// change a CSS transform, and a sharper bitmap is rendered once motion settles.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FitMode, PageTheme, ReadingState, Session, Stage } from '../../../core/models';
import { INPUT, zoomFactor } from '../../../core/input/config';
import { GAME } from '../../../core/gamification/config';
import { autoFit, clamp, clampView, columnRegion, fitScale, layout, nextFit, pageBox, scrollFraction, zoomAbout, type Layout, type Size, type ViewState } from '../../../core/reader/viewport';
import { pageLabel, spreadLayout, spreadPages, stepSpread, type SpreadPart } from '../../../core/reader/spread';
import { boxH, boxW, clampBox, type Box } from '../../../core/layout/box';
import { cropForPage } from '../../../core/layout/crop';
import { columnSegments, type Segment } from '../../../core/layout/columns';
import { stageForPage, stageNumeral } from '../../../core/stages/derive';
import { GUTTER_PX } from '../../../core/settings';
import { stageClearXp } from '../../../core/gamification/levels';
import { streakInfo, weekDots } from '../../../core/gamification/streak';
import { BOOK_TROPHIES, GLOBAL_TROPHIES } from '../../../core/gamification/trophies';
import { wordsOrNull } from '../../../core/gamification/coverage';
import type { Outcome } from '../../../core/gamification/engine';
import { readingDayKey, weekdayIndex } from '../../../core/time';
import { pdfUrl } from '../../../shared/api';
import { PdfPasswordError, closePdf, openPdf } from '../../../pdf/document';
import { hasText, pageContentBox, readPageInk, readPageText, textColumns, type PageText } from '../../../pdf/layout';
import { PageRenderer, type Rendered } from '../../../pdf/render';
import { THEME_BG, drawThemed } from '../../../pdf/themes';
import { indexWithDoc, markOpened, needsLayout, saveReadingState, saveSession, toggleBookmark, updateSettings } from '../../actions';
import { api } from '../../api';
import { useInput, useInputApi } from '../../input/InputProvider';
import { useNav } from '../../nav';
import { store, useApp, useBookGame } from '../../store';
import { useGame } from '../../game';
import { C, STAGE_H, STAGE_W, chakra } from '../../tokens';
import { useStageScale } from '../../components/Scaler';
import { useToast } from '../../components/Toast';
import { PromptBar } from '../../components/Glyph';
import { Spinner } from '../../components/Icons';
import { GoToPage } from '../GoToPage';
import { ReaderHud } from './ReaderHud';
import { DisplaySheet } from './DisplaySheet';
import { StageMapOverlay } from './StageMapOverlay';
import { ReaderGame } from './readerGame';
import type { SessionSummary } from '../SessionComplete';

const VP: Size = { w: STAGE_W, h: STAGE_H };
const SETTLE_MS = 160;
const DETAIL_MS = 200;
const PREFETCH_MS = 100;
const SCROLL_TWEEN_MS = 140;
const EMPTY_STAGES: Stage[] = [];

type Overlay = null | 'display' | 'stagemap' | 'goto';
type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; title: string; detail: string };

interface Drawn {
  page: number;
  /** What the base canvas holds: "12" for a page, "s:12-13" for a two-page spread. */
  key: string;
  /** Device px per point of the bitmap on the base canvas. */
  scale: number;
  /** CSS px per point it was laid out at. */
  ds: number;
  theme: PageTheme;
}

interface Detail {
  page: number;
  ds: number;
  theme: PageTheme;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Per-page layout facts: size, text, own content box, column segments (§8.5, §8.6). */
interface PageGeom {
  size: Size;
  text: PageText | null;
  own: Box | null;
  segments: Segment[] | null;
}

interface ReaderState {
  renderer: PageRenderer | null;
  geom: Map<number, PageGeom>;
  /** Current column segment (Column mode). */
  seg: number;
  pageCount: number;
  /** The page shown, or the first (left) page of a two-page spread. */
  page: number;
  /** The page size, or the whole spread's size in spread units (see core/reader/spread.ts). */
  size: Size | null;
  /** Two pages fit: the pages side by side; null otherwise. */
  parts: SpreadPart[] | null;
  /** Two pages fit: page 1 stands alone (per book). */
  spreadCover: boolean;
  /** Spread pages that were on screen at the last transform (dwell goes to one of these). */
  visible: number[];
  v: ViewState;
  fit: FitMode;
  fitChosen: boolean;
  themeOverride: PageTheme | undefined;
  drawn: Drawn | null;
  detail: Detail | null;
  tokens: { render: number; detail: number; nav: number };
  timers: { settle?: number; detail?: number; prefetch?: number; persist?: number };
  tween: { from: number; to: number; start: number; dur: number } | null;
  bumpArmed: -1 | 1 | null;
  lastMoveAt: number;
  pointer: { x: number; y: number; at: number } | null;
  drag: { x: number; y: number; id: number } | null;
}

export function ReaderScreen({ bookId, jumpTo }: { bookId: string; jumpTo?: number }) {
  const nav = useNav();
  const input = useInputApi();
  const toast = useToast();
  const stageScale = useStageScale();
  const game = useGame();
  const book = useApp((s) => s.books[bookId]);
  const stages = useApp((s) => s.stages[bookId]) ?? EMPTY_STAGES;
  const bookmarks = useApp((s) => s.bookmarks[bookId]);
  const settings = useApp((s) => s.settings);

  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [hud, setHud] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const baseRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const bumpRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const st = useRef<ReaderState>({
    renderer: null,
    geom: new Map(),
    seg: 0,
    pageCount: 0,
    page: 1,
    size: null,
    parts: null,
    spreadCover: true,
    visible: [],
    v: { zoom: 1, scrollY: 0, panX: 0 },
    fit: 'width',
    fitChosen: false,
    themeOverride: undefined,
    drawn: null,
    detail: null,
    tokens: { render: 0, detail: 0, nav: 0 },
    timers: {},
    tween: null,
    bumpArmed: null,
    lastMoveAt: 0,
    pointer: null,
    drag: null,
  }).current;

  const session = useRef<Session>({ id: crypto.randomUUID(), bookId, startedAt: Date.now(), activeMs: 0, startPage: 1, countedPages: 0 }).current;
  const savedActive = useRef(0);
  const gameRef = useRef<ReaderGame | null>(null);
  gameRef.current ??= new ReaderGame(bookId, session.id, (o) => announce(o));
  const gameT = gameRef.current;
  const overlayRef = useRef<Overlay>(overlay);
  overlayRef.current = overlay;
  const bookGame = useBookGame(bookId);

  // Live values for callbacks that outlive a render.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const scaleRef = useRef(stageScale);
  scaleRef.current = stageScale;
  const bookRef = useRef(book);
  bookRef.current = book;
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  const gutterFor = (fit: FitMode) => (fit === 'page' || fit === 'spread' ? 0 : GUTTER_PX[settingsRef.current.gutters]);
  /** Pages on screen: one, or both pages of a spread. */
  const shown = (): number[] => (st.parts ? st.parts.map((p) => p.page) : [st.page]);
  const lastShown = (): number => shown()[shown().length - 1]!;
  const drawnKey = (): string => (st.parts ? `s:${shown().join('-')}` : String(st.page));
  /** The spread containing `page`: its pages, combined size and placement. */
  async function spreadFor(page: number): Promise<{ start: number; size: Size; parts: SpreadPart[] }> {
    const pages = spreadPages(page, st.pageCount, st.spreadCover);
    const geoms = await Promise.all(pages.map((n) => geomFor(n)));
    return { start: pages[0]!, ...spreadLayout(pages.map((n, i) => ({ page: n, size: geoms[i]!.size }))) };
  }
  /**
   * Which page earns reading time (§9.2). In a spread, the left page until it has
   * enough, then the right one, so a spread doesn't count twice as fast.
   */
  const dwellPage = (): number => {
    if (!st.parts) return st.page;
    const on = st.visible.length ? st.visible : shown();
    return on.find((p) => gameT.needsDwell(p)) ?? on.find((p) => !gameT.isCounted(p)) ?? st.page;
  };
  const theme = (): PageTheme => st.themeOverride ?? settingsRef.current.pageTheme;
  const pixelRatio = () => scaleRef.current * (window.devicePixelRatio || 1);
  const fitFor = (size: Size): FitMode => (st.fitChosen ? st.fit : autoFit(size, settingsRef.current.defaultFit, !!bookRef.current?.isTwoColumn));
  /** Column mode needs the page to have columns; otherwise it reads as Width (§8.5). */
  const fitOn = (n: number, fit: FitMode): FitMode => (fit === 'column' && !st.geom.get(n)?.segments?.length ? 'width' : fit);
  const effFit = (): FitMode => fitOn(st.page, st.fit);
  const gutter = () => gutterFor(effFit());

  /** The cropped content box of page `n` (§8.6), or the whole page with Auto-crop off. */
  const cropOf = (n: number): Box => {
    const g = st.geom.get(n);
    const size = g?.size ?? st.size!;
    if (!settingsRef.current.autoCrop) return pageBox(size);
    const b = bookRef.current;
    const crop = b?.cropOdd || b?.cropEven ? { odd: b.cropOdd ?? null, even: b.cropEven ?? null } : null;
    return cropForPage(g?.own ?? null, crop, n, size.w, size.h);
  };

  /** The page region shown: a padded column segment in Column mode, else the crop box. */
  const regionFor = (n: number, seg: number, fit: FitMode): Box => {
    const g = st.geom.get(n);
    const segs = g?.segments;
    if (fit === 'column' && g && segs?.length) {
      const s = segs[clamp(seg, 0, segs.length - 1)]!;
      // Left and right columns share one scale so moving between them doesn't zoom.
      const colW = s.kind === 'band' ? boxW(s.box) : Math.max(...segs.filter((x) => x.kind !== 'band').map((x) => boxW(x.box)));
      return columnRegion(s.box, g.size, VP, gutterFor('column'), colW);
    }
    // Two pages show the whole spread, uncropped, so art across the fold lines up.
    if (fit === 'spread' && st.parts && st.size) return pageBox(st.size);
    // Fit page shows the whole page (§8.3); auto-crop applies to width and column.
    if (fit === 'page' && g) return pageBox(g.size);
    return cropOf(n);
  };
  const regionNow = (): Box | null => (st.size ? regionFor(st.page, st.seg, effFit()) : null);
  const currentLayout = (): Layout | null => {
    const r = regionNow();
    return r ? layout(r, VP, effFit(), gutter(), st.v) : null;
  };

  /** Size, text, content box and columns for page `n`, cached for the session. */
  async function geomFor(n: number): Promise<PageGeom> {
    const known = st.geom.get(n);
    if (known) return known;
    const R = st.renderer!;
    const size = await R.size(n);
    let text: PageText | null = null;
    try {
      text = await readPageText(await R.page(n), n);
    } catch {
      text = null;
    }
    const own = text && hasText(text) ? pageContentBox(text) : null;
    let segments: Segment[] | null = null;
    if (text && hasText(text)) segments = textColumns(text, own ?? pageBox(size));
    else if (bookRef.current?.isTwoColumn) {
      // Scans: ink analysis on a small render (§8.5 step 2).
      try {
        const ink = await readPageInk(await R.page(n));
        if (ink.columns) segments = columnSegments(ink.columns, ink.crop ? clampBox(ink.crop, pageBox(size)) : pageBox(size));
      } catch {
        segments = null;
      }
    }
    const g: PageGeom = { size, text, own, segments };
    st.geom.set(n, g);
    if (st.geom.size > 80) st.geom.delete(st.geom.keys().next().value as number);
    gameT.setWords(n, text ? wordsOrNull(text.words, text.chars) : null);
    return g;
  }

  // ── Drawing ─────────────────────────────────────────────────────────────

  function applyTransform(): void {
    const L = currentLayout();
    const R = regionNow();
    const el = pageRef.current;
    const base = baseRef.current;
    if (!L || !R || !el || !base || !st.drawn) return;
    // The page container clips to the region (crop box or column segment); the
    // full-page canvas sits inside it, offset by the region's origin.
    const d = st.drawn.ds;
    const k = L.ds / d;
    el.style.width = `${boxW(R) * d}px`;
    el.style.height = `${boxH(R) * d}px`;
    el.style.transform = `translate3d(${L.x}px, ${L.y}px, 0) scale(${k})`;
    base.style.left = `${-R.x0 * d}px`;
    base.style.top = `${-R.y0 * d}px`;
    const det = detailRef.current;
    const showDetail = !st.parts && !!st.detail && st.detail.page === st.page && Math.abs(st.detail.ds - L.ds) < 1e-6 && st.detail.theme === theme();
    if (det) {
      det.style.display = showDetail ? 'block' : 'none';
      if (showDetail && st.detail) {
        det.style.left = `${st.detail.x0 / k - R.x0 * d}px`;
        det.style.top = `${st.detail.y0 / k - R.y0 * d}px`;
        det.style.width = `${(st.detail.x1 - st.detail.x0) / k}px`;
        det.style.height = `${(st.detail.y1 - st.detail.y0) / k}px`;
      }
    }
    const thumb = thumbRef.current;
    if (thumb) {
      const h = Math.max(16, 160 * Math.min(1, VP.h / L.ph));
      const top = L.maxScroll > 0 ? (st.v.scrollY / L.maxScroll) * (160 - h) : 0;
      thumb.style.height = `${h}px`;
      thumb.style.transform = `translateY(${top}px)`;
    }
    // Coverage (§9.2): the share of the content box (crop) seen so far. In Column
    // mode the segments together cover it; in a spread, each page gets its own part.
    if (st.parts && st.drawn.key === drawnKey()) {
      const sx0 = -L.ox / L.ds;
      const sx1 = (VP.w - L.ox) / L.ds;
      const sy0 = -L.oy / L.ds;
      const sy1 = (VP.h - L.oy) / L.ds;
      st.visible = [];
      for (const p of st.parts) {
        // The viewport in this page's own points.
        const vx0 = Math.max(0, (sx0 - p.x) / p.scale);
        const vx1 = Math.min(p.size.w, (sx1 - p.x) / p.scale);
        const vy0 = Math.max(0, sy0 / p.scale);
        const vy1 = Math.min(p.size.h, sy1 / p.scale);
        if (vx1 <= vx0 || vy1 <= vy0) continue;
        st.visible.push(p.page);
        const crop = cropOf(p.page);
        const cw = boxW(crop);
        const ch = boxH(crop);
        if (cw <= 0 || ch <= 0) continue;
        gameT.markView(p.page, {
          x0: clamp((vx0 - crop.x0) / cw, 0, 1),
          x1: clamp((vx1 - crop.x0) / cw, 0, 1),
          y0: clamp((vy0 - crop.y0) / ch, 0, 1),
          y1: clamp((vy1 - crop.y0) / ch, 0, 1),
        });
      }
    } else if (!st.parts && st.drawn.key === String(st.page)) {
      const crop = cropOf(st.page);
      const vx0 = Math.max(R.x0, -L.ox / L.ds);
      const vx1 = Math.min(R.x1, (VP.w - L.ox) / L.ds);
      const vy0 = Math.max(R.y0, -L.oy / L.ds);
      const vy1 = Math.min(R.y1, (VP.h - L.oy) / L.ds);
      const cw = boxW(crop);
      const ch = boxH(crop);
      if (vx1 > vx0 && vy1 > vy0 && cw > 0 && ch > 0) {
        gameT.markView(st.page, {
          x0: clamp((vx0 - crop.x0) / cw, 0, 1),
          x1: clamp((vx1 - crop.x0) / cw, 0, 1),
          y0: clamp((vy0 - crop.y0) / ch, 0, 1),
          y1: clamp((vy1 - crop.y0) / ch, 0, 1),
        });
      }
    }
  }

  /** Toasts and haptics for game events, by intensity (§9.1, §7.10). */
  function announce(o: Outcome): void {
    rerender();
    const mode = settingsRef.current.gameIntensity;
    if (mode === 'off') return;
    const full = mode === 'full';
    for (const s of o.stagesCleared) {
      const len = s.endPage - s.startPage + 1;
      toast.show({ kind: 'gold', eyebrow: `STAGE CLEAR · ${stageNumeral(s).toUpperCase()}`, line: s.label, ...(full ? { value: `+${stageClearXp(len)} XP` } : {}) });
      input.rumble('double');
    }
    if (o.bookCleared) toast.show({ kind: 'gold', eyebrow: 'BOOK CLEAR', line: bookRef.current?.title ?? '', ...(full ? { value: '+500 XP' } : {}) });
    if (!full) return;
    if (o.questDone) toast.show({ kind: 'gold', eyebrow: 'DAILY QUEST', line: `${settingsRef.current.dailyGoal} pages today`, value: '+50 XP' });
    if (o.trophies.length) {
      // Unlocks that land together share one toast.
      const names = o.trophies.map((t) => [...GLOBAL_TROPHIES, ...BOOK_TROPHIES].find((d) => d.id === t.trophyId)?.name ?? t.trophyId);
      const line = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
      toast.show({ kind: 'gold', eyebrow: names.length > 1 ? `${names.length} TROPHIES UNLOCKED` : 'TROPHY UNLOCKED', line });
    }
    if (o.levelUp) toast.show({ kind: 'gold', eyebrow: 'LEVEL UP', line: `Level ${o.levelUp}` });
  }

  function draw(r: Rendered, t: PageTheme): void {
    const c = baseRef.current;
    if (!c || !st.size) return;
    c.width = r.bitmap.width;
    c.height = r.bitmap.height;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return;
    drawThemed(ctx, r.bitmap, t);
    const ds = r.scale / pixelRatio();
    c.style.width = `${st.size.w * ds}px`;
    c.style.height = `${st.size.h * ds}px`;
    st.drawn = { page: r.page, key: String(r.page), scale: r.scale, ds, theme: t };
    applyTransform();
  }

  /** Draw a spread's pages side by side into the base canvas at `scale` device px per spread unit. */
  function drawSpread(bitmaps: Rendered[], scale: number, t: PageTheme, key: string): void {
    const c = baseRef.current;
    if (!c || !st.size || !st.parts || key !== drawnKey()) return;
    c.width = Math.max(1, Math.round(st.size.w * scale));
    c.height = Math.max(1, Math.round(st.size.h * scale));
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return;
    st.parts.forEach((p, i) => {
      const b = bitmaps[i];
      if (!b) return;
      // Snap the seam to whole pixels so the two halves of a picture meet exactly.
      const x0 = Math.round(p.x * scale);
      const x1 = Math.round((p.x + p.size.w * p.scale) * scale);
      drawThemed(ctx, b.bitmap, t, x0, 0, x1 - x0, c.height);
    });
    const ds = scale / pixelRatio();
    c.style.width = `${st.size.w * ds}px`;
    c.style.height = `${st.size.h * ds}px`;
    st.drawn = { page: st.page, key, scale, ds, theme: t };
    applyTransform();
  }

  function blank(): void {
    const c = baseRef.current;
    if (!c || !st.size) return;
    const L = currentLayout()!;
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d', { alpha: false })!;
    ctx.fillStyle = THEME_BG[theme()];
    ctx.fillRect(0, 0, 8, 8);
    c.style.width = `${st.size.w * L.ds}px`;
    c.style.height = `${st.size.h * L.ds}px`;
    st.drawn = { page: st.page, key: drawnKey(), scale: 0, ds: L.ds, theme: theme() };
    applyTransform();
  }

  async function ensureRender(): Promise<void> {
    if (st.parts) return ensureSpreadRender();
    const R = st.renderer;
    const L = currentLayout();
    if (!R || !L || !st.size) return;
    const page = st.page;
    const key = String(page);
    const t = theme();
    const want = PageRenderer.capScale(st.size, L.ds * pixelRatio());
    const d = st.drawn;
    if (d && d.key === key && d.theme === t && d.scale > 0 && Math.abs(d.scale - want) / want < 0.03) {
      scheduleDetail();
      return;
    }
    const token = ++st.tokens.render;
    try {
      if (!d || d.key !== key || d.theme !== t || d.scale === 0) {
        const any = R.anyCached(page);
        if (any) draw(any, t);
        else {
          if (!d || d.key !== key) blank();
          // Uncached turn: a quick low-resolution frame first (§8.1).
          const lo = await R.render(page, want * 0.25, { cache: false });
          if (token !== st.tokens.render) return void lo.bitmap.close();
          draw(lo, t);
          lo.bitmap.close();
        }
      }
      const full = await R.render(page, want);
      if (token !== st.tokens.render) return;
      draw(full, t);
      scheduleDetail();
      schedulePrefetch();
    } catch (e) {
      if (token === st.tokens.render) console.warn('render failed', e);
    }
  }

  /** Two pages fit: render both pages at one scale and draw them side by side. */
  async function ensureSpreadRender(): Promise<void> {
    const R = st.renderer;
    const L = currentLayout();
    const parts = st.parts;
    if (!R || !L || !st.size || !parts) return;
    const key = drawnKey();
    const t = theme();
    // One bitmap for the whole spread, capped like a page (deep zoom stays a little soft).
    const want = PageRenderer.capScale(st.size, L.ds * pixelRatio());
    const d = st.drawn;
    if (d && d.key === key && d.theme === t && d.scale > 0 && Math.abs(d.scale - want) / want < 0.03) return;
    const token = ++st.tokens.render;
    try {
      const cached = parts.every((p) => R.cached(p.page, want * p.scale));
      if (!cached && (!d || d.key !== key || d.theme !== t || d.scale === 0)) {
        if (!d || d.key !== key) blank();
        // Uncached turn: a quick low-resolution frame first (§8.1).
        const lo = await Promise.all(parts.map((p) => R.render(p.page, want * p.scale * 0.25, { cache: false })));
        if (token !== st.tokens.render) return void lo.forEach((r) => r.bitmap.close());
        drawSpread(lo, want * 0.25, t, key);
        lo.forEach((r) => r.bitmap.close());
      }
      const full = await Promise.all(parts.map((p) => R.render(p.page, want * p.scale)));
      if (token !== st.tokens.render) return;
      drawSpread(full, want, t, key);
      schedulePrefetch();
    } catch (e) {
      if (token === st.tokens.render) console.warn('spread render failed', e);
    }
  }

  function scheduleDetail(): void {
    clearTimeout(st.timers.detail);
    st.timers.detail = window.setTimeout(() => void renderDetail(), DETAIL_MS);
  }

  /** Past the bitmap cap (deep zoom), render the visible region crisply. */
  async function renderDetail(): Promise<void> {
    const R = st.renderer;
    const L = currentLayout();
    if (!R || !L || !st.drawn || !st.size) return;
    if (st.parts) {
      st.detail = null; // spreads are one capped bitmap; no detail tiles
      return;
    }
    const pr = pixelRatio();
    const want = L.ds * pr;
    if (st.drawn.scale >= want * 0.97) {
      st.detail = null;
      applyTransform();
      return;
    }
    // Rectangles in page px at the current scale, limited to the shown region.
    const Rg = regionNow()!;
    const rx0 = Rg.x0 * L.ds;
    const ry0 = Rg.y0 * L.ds;
    const rx1 = Rg.x1 * L.ds;
    const ry1 = Rg.y1 * L.ds;
    const mx = VP.w * 0.3;
    const my = VP.h * 0.3;
    const x0 = clamp(-L.ox - mx, rx0, rx1);
    const y0 = clamp(-L.oy - my, ry0, ry1);
    const x1 = clamp(VP.w - L.ox + mx, rx0, rx1);
    const y1 = clamp(VP.h - L.oy + my, ry0, ry1);
    if (x1 <= x0 || y1 <= y0) return;
    const d = st.detail;
    const visible = { x0: clamp(-L.ox, rx0, rx1), y0: clamp(-L.oy, ry0, ry1), x1: clamp(VP.w - L.ox, rx0, rx1), y1: clamp(VP.h - L.oy, ry0, ry1) };
    if (d && d.page === st.page && Math.abs(d.ds - L.ds) < 1e-6 && d.theme === theme() && d.x0 <= visible.x0 && d.y0 <= visible.y0 && d.x1 >= visible.x1 && d.y1 >= visible.y1) return;
    const token = ++st.tokens.detail;
    const page = st.page;
    const t = theme();
    try {
      const bmp = await R.renderRegion(page, want, { x: x0 * pr, y: y0 * pr, w: (x1 - x0) * pr, h: (y1 - y0) * pr });
      if (token !== st.tokens.detail || page !== st.page) return void bmp.close();
      const c = detailRef.current;
      if (!c) return void bmp.close();
      c.width = bmp.width;
      c.height = bmp.height;
      drawThemed(c.getContext('2d', { alpha: false })!, bmp, t);
      bmp.close();
      st.detail = { page, ds: L.ds, theme: t, x0, y0, x1, y1 };
      applyTransform();
    } catch (e) {
      console.warn('detail render failed', e);
    }
  }

  function schedulePrefetch(): void {
    clearTimeout(st.timers.prefetch);
    st.timers.prefetch = window.setTimeout(() => void prefetch(), PREFETCH_MS);
  }

  /** After 100 ms idle, prerender the next two pages and the previous one (§8.1). */
  async function prefetch(): Promise<void> {
    const R = st.renderer;
    if (!R) return;
    const from = st.page;
    if (st.parts) {
      // Two pages: the next spread, then the previous one, at the scale they'll be drawn at.
      for (const d of [1, -1] as const) {
        const start = stepSpread(from, d, st.pageCount, st.spreadCover);
        if (start === null || st.page !== from || !st.parts) continue;
        if (performance.now() - st.lastMoveAt < PREFETCH_MS) return schedulePrefetch();
        try {
          const sp = await spreadFor(start);
          const want = PageRenderer.capScale(sp.size, fitScale(pageBox(sp.size), VP, 'spread', 0) * st.v.zoom * pixelRatio());
          for (const p of sp.parts) await R.render(p.page, want * p.scale);
        } catch {
          return;
        }
      }
      return;
    }
    for (const n of [from + 1, from + 2, from - 1]) {
      if (n < 1 || n > st.pageCount || st.page !== from) continue;
      if (performance.now() - st.lastMoveAt < PREFETCH_MS) return schedulePrefetch();
      try {
        const g = await geomFor(n);
        const fit = fitOn(n, fitFor(g.size));
        const region = regionFor(n, n < from ? Number.MAX_SAFE_INTEGER : 0, fit);
        const ds = fitScale(region, VP, fit, gutterFor(fit)) * st.v.zoom;
        await R.render(n, PageRenderer.capScale(g.size, ds * pixelRatio()));
      } catch {
        return;
      }
    }
  }

  // ── Motion ──────────────────────────────────────────────────────────────

  function moved(zoomed: boolean): void {
    const now = performance.now();
    st.lastMoveAt = now;
    input.keepAwake(now + 400);
    applyTransform();
    persistSoon();
    clearTimeout(st.timers.settle);
    st.timers.settle = window.setTimeout(() => {
      void ensureRender();
      scheduleDetail();
      if (zoomed) rerender();
    }, SETTLE_MS);
  }

  function setView(v: ViewState, zoomed = false): void {
    const r = regionNow();
    if (!r) return;
    st.v = clampView(r, VP, effFit(), gutter(), v);
    moved(zoomed);
  }

  function anchor(): { x: number; y: number } {
    const p = st.pointer;
    // Zoom about the pointer if a trackpad touched it in the last 2 s (§6.4).
    return p && performance.now() - p.at < 2000 ? { x: p.x, y: p.y } : { x: VP.w / 2, y: VP.h / 2 };
  }

  function zoomTo(z: number, at = anchor()): void {
    const r = regionNow();
    if (!r) return;
    st.v = zoomAbout(r, VP, effFit(), gutter(), st.v, z, at);
    moved(true);
  }

  function tweenScroll(to: number): void {
    const now = performance.now();
    st.tween = { from: st.v.scrollY, to, start: now, dur: settingsRef.current.reduceMotion ? 0 : SCROLL_TWEEN_MS };
    input.keepAwake(now + SCROLL_TWEEN_MS + 50);
  }

  function animate(el: HTMLElement | null, frames: Keyframe[], ms: number): void {
    if (!el || settingsRef.current.reduceMotion) return;
    el.animate(frames, { duration: ms, easing: 'ease-out' });
  }

  async function gotoPage(n: number, land: 'top' | 'bottom' = 'top', dir: -1 | 0 | 1 = 0): Promise<void> {
    const R = st.renderer;
    if (!R) return;
    let target = clamp(n, 1, st.pageCount);
    const token = ++st.tokens.nav;
    let g = await geomFor(target);
    const fit = fitFor(g.size);
    // Two pages: land on the spread that holds the page.
    let sp: Awaited<ReturnType<typeof spreadFor>> | null = null;
    if (fit === 'spread') {
      sp = await spreadFor(target);
      target = sp.start;
      g = await geomFor(target);
    }
    if (token !== st.tokens.nav) return;
    const before = drawnKey();
    st.page = target;
    st.parts = sp?.parts ?? null;
    st.size = sp?.size ?? g.size;
    st.fit = fit;
    st.visible = [];
    const changed = drawnKey() !== before;
    // Column mode lands on the first segment, or the last one when coming back up.
    const segs = effFit() === 'column' ? g.segments : null;
    st.seg = land === 'top' || !segs?.length ? 0 : segs.length - 1;
    st.tween = null;
    st.bumpArmed = null;
    st.detail = null;
    st.v = clampView(regionNow()!, VP, effFit(), gutter(), { zoom: st.v.zoom, panX: st.v.panX, scrollY: land === 'top' ? 0 : Number.MAX_SAFE_INTEGER });
    void ensureRender();
    applyTransform();
    if (changed && dir !== 0 && settingsRef.current.pageTransition === 'slide') {
      animate(slideRef.current, [{ transform: `translateX(${dir * 60}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }], 120);
    }
    if (changed) {
      toast.notePageTurn();
      input.rumble('tick');
      gameT.flush();
    }
    for (const p of shown()) gameT.reach(p, Date.now());
    persistNow();
    rerender();
  }

  /** The page (or spread start) one turn away, or null at either end. */
  function neighbour(d: -1 | 1): number | null {
    if (st.parts) return stepSpread(st.page, d, st.pageCount, st.spreadCover);
    const next = st.page + d;
    return next >= 1 && next <= st.pageCount ? next : null;
  }

  function turn(d: -1 | 1): void {
    const next = neighbour(d);
    if (next === null) return bump(d);
    void gotoPage(next, 'top', d);
  }

  function bump(d: -1 | 1): void {
    animate(bumpRef.current, [{ transform: 'none' }, { transform: `translateY(${-d * INPUT.edgeBumpPx}px)` }, { transform: 'none' }], INPUT.edgeBumpMs);
  }

  /** D-pad ↑/↓: 80 % of the viewport; at an edge, bump first, then turn (§6.4). */
  function step(d: -1 | 1, repeat: boolean): void {
    const L = currentLayout();
    if (!L) return;
    const y = st.tween ? st.tween.to : st.v.scrollY;
    const atEdge = d > 0 ? y >= L.maxScroll - 0.5 : y <= 0.5;
    if (!atEdge) {
      st.bumpArmed = null;
      tweenScroll(clamp(y + d * INPUT.scrollStep * VP.h, 0, L.maxScroll));
      return;
    }
    if (repeat) return; // holding the D-pad stops at the edge
    // Column mode (§8.5): the next press pans to the next segment; after the last
    // one, the page edge rules apply.
    const segs = effFit() === 'column' ? st.geom.get(st.page)?.segments : null;
    if (segs && st.seg + d >= 0 && st.seg + d < segs.length) {
      changeSegment(st.seg + d, d > 0 ? 'top' : 'bottom', d);
      return;
    }
    const next = neighbour(d);
    if (st.bumpArmed === d && next !== null) {
      st.bumpArmed = null;
      void gotoPage(next, d > 0 ? 'top' : 'bottom', d);
      return;
    }
    st.bumpArmed = d;
    bump(d);
  }

  /** Move to another column segment with a 200 ms pan (§8.5, §10.5). */
  function changeSegment(i: number, land: 'top' | 'bottom', d: -1 | 1): void {
    const segs = st.geom.get(st.page)?.segments;
    if (!segs?.[i]) return;
    const from = segs[st.seg];
    const to = segs[i]!;
    st.seg = i;
    st.tween = null;
    st.bumpArmed = null;
    st.detail = null;
    st.v = clampView(regionNow()!, VP, 'column', gutter(), { zoom: st.v.zoom, panX: 0, scrollY: land === 'top' ? 0 : Number.MAX_SAFE_INTEGER });
    void ensureRender();
    applyTransform();
    // Left → right column slides in sideways; anything else comes from below or above.
    const sideways = from && from.kind !== 'band' && to.kind !== 'band' && Math.abs(from.box.y0 - to.box.y0) < 1;
    const dx = sideways ? 80 * d : 0;
    const dy = sideways ? 0 : 80 * d;
    animate(slideRef.current, [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], 200);
    input.keepAwake(performance.now() + 260);
    persistSoon();
  }

  function stageJump(d: -1 | 1): void {
    const list = stagesRef.current;
    // In a spread, forward goes past the stage of the right page, back starts from the left one.
    const cur = stageForPage(list, d > 0 ? lastShown() : st.page);
    if (!cur) return;
    if (d > 0) {
      const next = list[cur.index + 1];
      if (next) void gotoPage(next.startPage, 'top', 1);
    } else if (st.page > cur.startPage) void gotoPage(cur.startPage, 'top', -1);
    else {
      const prev = list[cur.index - 1];
      if (prev) void gotoPage(prev.startPage, 'top', -1);
    }
  }

  function setFit(f: FitMode): void {
    if (!st.size) return;
    if (f === 'spread' || st.parts) {
      // Into or out of Two pages: the pages shown change, so lay out again from this page.
      st.fit = f;
      st.fitChosen = true;
      st.detail = null;
      st.v = { zoom: 1, panX: 0, scrollY: 0 };
      void gotoPage(st.page, 'top', 0);
      return;
    }
    const L = currentLayout();
    const frac = L ? scrollFraction(L, st.v) : 0;
    // The page point at the centre of the screen picks the column segment to start in.
    const cx = L ? (VP.w / 2 - L.ox) / L.ds : 0;
    const cy = L ? (VP.h / 2 - L.oy) / L.ds : 0;
    st.fit = f;
    st.fitChosen = true;
    st.detail = null;
    const segs = st.geom.get(st.page)?.segments;
    if (f === 'column' && segs?.length) {
      const hit = segs.findIndex((s) => cy >= s.box.y0 && cy <= s.box.y1 && cx >= s.box.x0 && cx <= s.box.x1);
      st.seg = hit >= 0 ? hit : Math.max(0, segs.findIndex((s) => cy <= s.box.y1));
    }
    const region = regionNow()!;
    const fit = effFit();
    const v = clampView(region, VP, fit, gutter(), { zoom: 1, panX: 0, scrollY: 0 });
    const L2 = layout(region, VP, fit, gutter(), v);
    st.v = clampView(region, VP, fit, gutter(), { ...v, scrollY: fit === 'column' ? 0 : frac * L2.maxScroll });
    moved(true);
    persistNow();
    rerender();
  }

  const hasColumns = (): boolean => !!st.geom.get(st.page)?.segments?.length;

  /** Display menu: in Two pages, whether page 1 stands alone (per book). */
  function setSpreadCover(on: boolean): void {
    st.spreadCover = on;
    if (st.parts) void gotoPage(st.page, 'top', 0);
    else persistNow();
    rerender();
  }

  // ── Persistence and sessions (§8.8, §9.8) ───────────────────────────────

  function readingState(): ReadingState {
    const L = currentLayout();
    return {
      bookId,
      page: st.page,
      scrollY: L ? scrollFraction(L, st.v) : 0,
      zoom: st.v.zoom,
      fit: st.fit,
      fitChosen: st.fitChosen,
      ...(effFit() === 'column' ? { segment: st.seg } : {}),
      ...(st.themeOverride ? { themeOverride: st.themeOverride } : {}),
      orientation: 'landscape',
      spreadCover: st.spreadCover,
    };
  }

  function persistNow(): void {
    if (!st.renderer) return;
    clearTimeout(st.timers.persist);
    st.timers.persist = undefined;
    saveReadingState(readingState());
  }

  function persistSoon(): void {
    if (st.timers.persist !== undefined) return;
    st.timers.persist = window.setTimeout(() => {
      st.timers.persist = undefined;
      persistNow();
    }, 1000);
  }

  function saveSessionNow(end: boolean): void {
    session.countedPages = gameT.totals.pages;
    if (session.activeMs <= 0) return;
    const s: Session = { ...session, endPage: lastShown(), ...(end ? { endedAt: Date.now() } : {}) };
    saveSession(s, savedActive.current);
    savedActive.current = session.activeMs;
  }

  /** The visible page at half size, for Session complete's blurred background. */
  function snapshot(): string | undefined {
    const c = baseRef.current;
    const L = currentLayout();
    if (!c || !L || !st.drawn || st.drawn.scale === 0) return undefined;
    try {
      const out = document.createElement('canvas');
      out.width = VP.w / 2;
      out.height = VP.h / 2;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = C.bgReader;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(c, L.ox / 2, L.oy / 2, (st.size!.w * L.ds) / 2, (st.size!.h * L.ds) / 2);
      return out.toDataURL('image/jpeg', 0.7);
    } catch {
      return undefined;
    }
  }

  function summary(): SessionSummary {
    const s = store.get();
    const today = readingDayKey(Date.now());
    const pagesToday = s.pagesByDay.get(today) ?? 0;
    const qualifiedNow = gameT.pagesTodayBefore < GAME.streakMinPages && pagesToday >= GAME.streakMinPages;
    const bg = snapshot();
    const t = gameT.totals;
    return {
      bookId,
      title: bookRef.current?.title ?? '',
      startPage: session.startPage,
      endPage: lastShown(),
      pages: t.pages,
      activeMs: session.activeMs,
      xp: t.xp,
      trophies: t.trophies,
      stageClears: t.stageClears,
      bookCleared: t.bookCleared,
      questDone: t.questDone,
      dailyGoal: s.settings.dailyGoal,
      xpBefore: gameT.xpBefore,
      streak: streakInfo(s.pagesByDay, today),
      week: weekDots(s.pagesByDay, today),
      qualifiedToday: qualifiedNow ? weekdayIndex(today) : null,
      ...(bg ? { background: bg } : {}),
    };
  }

  /** B: save and leave; Session complete if anything was counted or earned (§5). */
  function leave(): void {
    gameT.flush();
    persistNow();
    saveSessionNow(true);
    const t = gameT.totals;
    if (settingsRef.current.gameIntensity !== 'off' && (t.pages > 0 || t.xp.length > 0)) {
      toast.clear(); // the summary lists everything the queued toasts would say
      nav.replace({ name: 'session', summary: summary() });
    } else nav.pop();
  }

  // ── Open the document ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let renderer: PageRenderer | null = null;
    (async () => {
      try {
        void markOpened(bookId);
        const doc = await openPdf(pdfUrl(bookId));
        if (cancelled) return closePdf(doc);
        renderer = new PageRenderer(doc);
        st.renderer = renderer;
        st.pageCount = doc.numPages;
        const saved = store.get().states[bookId];
        const start = clamp(jumpTo ?? saved?.page ?? 1, 1, doc.numPages);
        const g = await geomFor(start);
        if (cancelled) return;
        st.page = start;
        st.size = g.size;
        st.fitChosen = !!saved?.fitChosen;
        st.fit = saved?.fit ?? 'width';
        st.fit = fitFor(g.size);
        st.themeOverride = saved?.themeOverride;
        st.spreadCover = saved?.spreadCover ?? true;
        if (st.fit === 'spread') {
          const sp = await spreadFor(start);
          if (cancelled) return;
          st.page = sp.start;
          st.parts = sp.parts;
          st.size = sp.size;
        }
        const segs = effFit() === 'column' ? g.segments : null;
        st.seg = segs?.length && !jumpTo ? clamp(saved?.segment ?? 0, 0, segs.length - 1) : 0;
        st.v = clampView(regionNow()!, VP, effFit(), gutter(), { zoom: saved?.zoom ?? 1, panX: 0, scrollY: 0 });
        if (saved && !jumpTo) {
          const L = layout(regionNow()!, VP, effFit(), gutter(), st.v);
          st.v = clampView(regionNow()!, VP, effFit(), gutter(), { ...st.v, scrollY: saved.scrollY * L.maxScroll });
        }
        session.startPage = st.page;
        setStatus({ kind: 'ready' });
        blank();
        void ensureRender();
        persistNow();
        void gameT.start(doc.numPages, store.get().stages[bookId] ?? []).then(() => {
          if (!cancelled) for (const p of shown()) gameT.reach(p, Date.now());
        });
        const b = store.get().books[bookId];
        if (b && (needsLayout(b) || !b.thumbAt)) indexWithDoc(bookId, doc).catch((e) => console.warn('index in reader failed', e));
      } catch (e) {
        if (cancelled) return;
        console.warn('open failed', e);
        setStatus(
          e instanceof PdfPasswordError
            ? { kind: 'error', title: 'This PDF is password-protected', detail: 'Entering a password with the on-screen keyboard arrives in a later build.' }
            : { kind: 'error', title: "Can't open this PDF", detail: bookRef.current?.path.split(/[\\/]/).pop() ?? '' },
        );
      }
    })();
    return () => {
      cancelled = true;
      for (const t of Object.values(st.timers)) clearTimeout(t);
      if (st.renderer === renderer && renderer) {
        gameT.flush();
        persistNow();
        saveSessionNow(true);
        st.renderer = null;
        st.drawn = null;
        renderer.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Active time (idle cap, §9.2) and the 10 s safety save (§8.8).
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      const active = !document.hidden && document.hasFocus() && performance.now() - input.lastInputAt() < GAME.idleCapMs;
      if (active) {
        session.activeMs += 1000;
        // Dwell (§9.2): only while the page is actually on screen, not under an overlay.
        if (st.renderer && overlayRef.current === null) gameT.tick(dwellPage(), 1000, Date.now());
      }
      if (++n % 10 === 0) {
        gameT.flush();
        persistNow();
        saveSessionNow(false);
      }
      if (hudRef.current) rerender();
    }, 1000);
    const off = api.onPower((e) => {
      if (e === 'suspend') {
        gameT.flush();
        persistNow();
        saveSessionNow(false);
      }
    });
    return () => {
      clearInterval(t);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  // Toasts move below the HUD's top bar so they don't cover its chips.
  useEffect(() => {
    toast.setOffset(hud ? 72 : 0);
    return () => toast.setOffset(0);
  }, [hud, toast]);

  // Stages can arrive after opening (first-time indexing).
  useEffect(() => {
    gameT.setStages(stages);
  }, [stages, gameT]);

  // Things that change the page layout: gutters, theme, fit, auto-crop, and a
  // background re-analysis of this book (crop boxes, two-column).
  useEffect(() => {
    if (!st.size || !st.renderer) return;
    const pageSize = st.geom.get(st.page)?.size ?? st.size;
    // A new default fit can switch Two pages on or off; that needs a fresh layout.
    if ((fitFor(pageSize) === 'spread') !== !!st.parts) {
      void gotoPage(st.page, 'top', 0);
      return;
    }
    st.fit = fitFor(pageSize);
    const segs = st.geom.get(st.page)?.segments;
    st.seg = segs?.length ? clamp(st.seg, 0, segs.length - 1) : 0;
    st.v = clampView(regionNow()!, VP, effFit(), gutter(), st.v);
    st.detail = null;
    applyTransform();
    void ensureRender();
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.gutters, settings.pageTheme, settings.defaultFit, settings.autoCrop, stageScale, book?.cropOdd, book?.cropEven, book?.isTwoColumn]);

  // ── Input ───────────────────────────────────────────────────────────────

  useInput(
    {
      context: 'reader',
      onAction: (e) => {
        if (status.kind === 'error') {
          if (e.action === 'back' || e.action === 'confirm') nav.pop();
          return;
        }
        if (status.kind !== 'ready') {
          if (e.action === 'back') nav.pop();
          return;
        }
        switch (e.action) {
          case 'page_next':
            return turn(1);
          case 'page_prev':
            return turn(-1);
          case 'nav_down':
            return step(1, e.repeat);
          case 'nav_up':
            return step(-1, e.repeat);
          case 'stage_next':
            return stageJump(1);
          case 'stage_prev':
            return stageJump(-1);
          case 'confirm':
            return setHud((h) => !h);
          case 'secondary': {
            const L = currentLayout();
            const page = st.page;
            void toggleBookmark(bookId, page, L ? scrollFraction(L, st.v) : 0).then((added) =>
              toast.show({ kind: 'neutral', eyebrow: 'BOOKMARK', line: added ? `Bookmarked p. ${page}` : 'Bookmark removed' }),
            );
            return;
          }
          case 'tertiary':
            return setOverlay('stagemap');
          case 'view':
            return setFit(nextFit(effFit(), hasColumns()));
          case 'menu':
            return setOverlay('display');
          case 'zoom_reset':
            return zoomTo(1);
          case 'link_back':
            return; // links and history arrive with M5
          case 'back':
            return leave();
        }
      },
      onFrame: (a, dt, now) => {
        if (status.kind !== 'ready' || !st.size) return;
        let changed = false;
        let zoomed = false;
        if (st.tween) {
          const t = st.tween.dur > 0 ? Math.min(1, (now - st.tween.start) / st.tween.dur) : 1;
          const e = 1 - Math.pow(1 - t, 3);
          st.v = { ...st.v, scrollY: st.tween.from + (st.tween.to - st.tween.from) * e };
          if (t >= 1) st.tween = null;
          changed = true;
        }
        if (a.scroll || a.panY) {
          st.tween = null;
          st.bumpArmed = null;
          st.v = { ...st.v, scrollY: st.v.scrollY + (a.scroll + a.panY) * dt };
          changed = true;
        }
        if (a.panX) {
          st.v = { ...st.v, panX: st.v.panX + a.panX * dt };
          changed = true;
        }
        if (a.zoom) {
          st.v = zoomAbout(regionNow()!, VP, effFit(), gutter(), st.v, st.v.zoom * zoomFactor(a.zoom, dt), anchor());
          zoomed = true;
        }
        if (changed || zoomed) setView(st.v, zoomed);
      },
    },
    overlay === null,
  );

  // Trackpads: left = mouse wheel scroll, right = pointer (drag pans).
  const toStage = (clientX: number, clientY: number) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) * VP.w) / r.width, y: ((clientY - r.top) * VP.h) / r.height };
  };
  const onWheel = (e: React.WheelEvent) => {
    if (status.kind !== 'ready' || overlay) return;
    const mult = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? VP.h : 1;
    const s = scaleRef.current;
    st.pointer = { ...toStage(e.clientX, e.clientY), at: performance.now() };
    if (e.ctrlKey) return zoomTo(st.v.zoom * Math.exp(-e.deltaY * 0.01), st.pointer);
    st.tween = null;
    st.bumpArmed = null;
    setView({ ...st.v, scrollY: st.v.scrollY + (e.deltaY * mult) / s, panX: st.v.panX + (e.deltaX * mult) / s });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || overlay) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    st.drag = { ...toStage(e.clientX, e.clientY), id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = toStage(e.clientX, e.clientY);
    st.pointer = { ...p, at: performance.now() };
    if (st.drag && st.drag.id === e.pointerId) {
      const dx = p.x - st.drag.x;
      const dy = p.y - st.drag.y;
      st.drag = { ...p, id: e.pointerId };
      st.tween = null;
      setView({ ...st.v, scrollY: st.v.scrollY - dy, panX: st.v.panX - dx });
    }
  };
  const onPointerUp = () => {
    st.drag = null;
  };

  // ── View ────────────────────────────────────────────────────────────────

  const t = theme();
  const progress = st.pageCount ? lastShown() / st.pageCount : 0;
  const showChrome = status.kind === 'ready' && !settings.zen && !hud;

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bgReader, overflow: 'hidden' }}>
      <div
        ref={viewportRef}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={bumpRef} style={{ position: 'absolute', inset: 0 }}>
          <div ref={slideRef} style={{ position: 'absolute', inset: 0 }}>
            <div
              ref={pageRef}
              aria-label={st.parts ? `PDF pages ${pageLabel(shown())}` : `PDF page ${st.page}`}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transformOrigin: '0 0',
                willChange: 'transform',
                overflow: 'hidden', // clips the page to the crop box or column segment
                boxShadow: '0 0 60px rgba(0,0,0,0.6)',
                background: THEME_BG[t],
                visibility: status.kind === 'ready' ? 'visible' : 'hidden',
              }}
            >
              <canvas ref={baseRef} style={{ position: 'absolute', display: 'block' }} />
              <canvas ref={detailRef} style={{ position: 'absolute', display: 'none' }} />
            </div>
          </div>
        </div>
      </div>

      {showChrome ? (
        <>
          <div aria-hidden="true" style={{ position: 'absolute', right: 46, top: 320, width: 4, height: 160, borderRadius: 2, background: C.readerTrack, overflow: 'hidden' }}>
            <div ref={thumbRef} style={{ width: 4, height: 70, borderRadius: 2, background: C.glyphOutline }} />
          </div>
          <span style={{ position: 'absolute', right: 28, bottom: 18, font: chakra(600, 14), letterSpacing: '0.06em', color: C.textDim }}>
            {pageLabel(shown())} / {st.pageCount}
          </span>
        </>
      ) : null}
      {status.kind === 'ready' && !settings.zen ? (
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: C.readerProgressTrack }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: C.gold }} />
        </div>
      ) : null}

      {status.kind === 'loading' ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: C.textMuted, font: chakra(600, 15), letterSpacing: '0.12em' }}>
          <Spinner /> OPENING
        </div>
      ) : null}
      {status.kind === 'error' ? <ErrorPanel title={status.title} detail={status.detail} /> : null}

      {hud && status.kind === 'ready' && book ? (
        <ReaderHud
          book={book}
          stages={stages}
          page={st.page}
          pageEnd={lastShown()}
          pageCount={st.pageCount}
          fit={effFit()}
          zoom={st.v.zoom}
          theme={t}
          bookmarks={bookmarks ?? []}
          sessionMs={session.activeMs}
          intensity={game.intensity}
          sessionPages={gameT.totals.pages}
          sessionXp={gameT.totals.xp.reduce((a, e) => a + e.amount, 0)}
          cleared={bookGame.clearedStages}
        />
      ) : null}

      {overlay === 'display' ? (
        <DisplaySheet
          theme={t}
          fit={effFit()}
          hasColumns={hasColumns()}
          spreadCover={st.spreadCover}
          onSpreadCover={setSpreadCover}
          bookOnly={st.themeOverride !== undefined}
          onTheme={(th, bookOnly) => {
            if (bookOnly) st.themeOverride = th;
            else {
              st.themeOverride = undefined;
              void updateSettings({ pageTheme: th });
            }
            void ensureRender();
            persistNow();
            rerender();
          }}
          onBookOnly={(on) => {
            st.themeOverride = on ? theme() : undefined;
            void ensureRender();
            persistNow();
            rerender();
          }}
          onFit={setFit}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === 'stagemap' && book ? (
        <StageMapOverlay
          stages={stages}
          page={st.page}
          showXp={game.showXp}
          counted={bookGame.counted}
          cleared={bookGame.clearedStages}
          onJump={(s) => {
            setOverlay(null);
            const cur = stageForPage(stages, st.page);
            if (!cur || cur.index !== s.index) void gotoPage(s.startPage, 'top', 0);
          }}
          onGoTo={() => setOverlay('goto')}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === 'goto' ? (
        <GoToPage
          pageCount={st.pageCount}
          start={st.page}
          stages={stages}
          onGo={(p) => {
            setOverlay(null);
            void gotoPage(p, 'top', 0);
          }}
          onClose={() => setOverlay('stagemap')}
        />
      ) : null}
    </div>
  );
}

function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: C.bgBase }}>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
        <span style={{ font: chakra(600, 26) }}>{title}</span>
        <span style={{ fontSize: 14, color: C.textMuted, maxWidth: 560 }}>{detail}</span>
      </main>
      <PromptBar prompts={[{ glyphs: ['B'], label: 'Back' }]} />
    </div>
  );
}
