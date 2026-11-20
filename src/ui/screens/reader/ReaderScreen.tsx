// Reader (§7.4 focus mode, §7.5 HUD, §8 engine).
//
// One page at a time with vertical scrolling inside it (§8.2). The page is a
// canvas holding a themed bitmap; scrolling, panning and live zoom only
// change a CSS transform, and a sharper bitmap is rendered once motion settles.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FitMode, PageTheme, ReadingState, Session, Stage } from '../../../core/models';
import { INPUT, zoomFactor } from '../../../core/input/config';
import { GAME } from '../../../core/gamification/config';
import { autoFit, clamp, clampView, fitScale, layout, nextFit, scrollFraction, zoomAbout, type Layout, type Size, type ViewState } from '../../../core/reader/viewport';
import { stageForPage } from '../../../core/stages/derive';
import { GUTTER_PX } from '../../../core/settings';
import { pdfUrl } from '../../../shared/api';
import { PdfPasswordError, closePdf, openPdf } from '../../../pdf/document';
import { PageRenderer, type Rendered } from '../../../pdf/render';
import { THEME_BG, drawThemed } from '../../../pdf/themes';
import { indexWithDoc, markOpened, saveReadingState, saveSession, toggleBookmark, updateSettings } from '../../actions';
import { api } from '../../api';
import { useInput, useInputApi } from '../../input/InputProvider';
import { useNav } from '../../nav';
import { store, useApp } from '../../store';
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

interface ReaderState {
  renderer: PageRenderer | null;
  pageCount: number;
  page: number;
  size: Size | null;
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
    pageCount: 0,
    page: 1,
    size: null,
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

  // Live values for callbacks that outlive a render.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const scaleRef = useRef(stageScale);
  scaleRef.current = stageScale;
  const bookRef = useRef(book);
  bookRef.current = book;
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  const gutter = () => (st.fit === 'page' ? 0 : GUTTER_PX[settingsRef.current.gutters]);
  const theme = (): PageTheme => st.themeOverride ?? settingsRef.current.pageTheme;
  const pixelRatio = () => scaleRef.current * (window.devicePixelRatio || 1);
  const currentLayout = (): Layout | null => (st.size ? layout(st.size, VP, st.fit, gutter(), st.v) : null);
  const fitFor = (size: Size): FitMode => (st.fitChosen ? st.fit : autoFit(size, settingsRef.current.defaultFit, !!bookRef.current?.isTwoColumn));

  // ── Drawing ─────────────────────────────────────────────────────────────

  function applyTransform(): void {
    const L = currentLayout();
    const el = pageRef.current;
    if (!L || !el || !st.drawn) return;
    const k = L.ds / st.drawn.ds;
    el.style.transform = `translate3d(${L.x}px, ${L.y}px, 0) scale(${k})`;
    const det = detailRef.current;
    if (det) det.style.display = st.detail && st.detail.page === st.page && Math.abs(st.detail.ds - L.ds) < 1e-6 && st.detail.theme === theme() ? 'block' : 'none';
    if (det && st.detail && det.style.display === 'block') {
      det.style.left = `${st.detail.x0 / k}px`;
      det.style.top = `${st.detail.y0 / k}px`;
      det.style.width = `${(st.detail.x1 - st.detail.x0) / k}px`;
      det.style.height = `${(st.detail.y1 - st.detail.y0) / k}px`;
    }
    const thumb = thumbRef.current;
    if (thumb) {
      const h = Math.max(16, 160 * Math.min(1, VP.h / L.ph));
      const top = L.maxScroll > 0 ? (st.v.scrollY / L.maxScroll) * (160 - h) : 0;
      thumb.style.height = `${h}px`;
      thumb.style.transform = `translateY(${top}px)`;
    }
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
    st.drawn = { page: r.page, scale: r.scale, ds, theme: t };
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
    c.style.width = `${L.pw}px`;
    c.style.height = `${L.ph}px`;
    st.drawn = { page: st.page, scale: 0, ds: L.ds, theme: theme() };
    applyTransform();
  }

  async function ensureRender(): Promise<void> {
    const R = st.renderer;
    const L = currentLayout();
    if (!R || !L || !st.size) return;
    const page = st.page;
    const t = theme();
    const want = PageRenderer.capScale(st.size, L.ds * pixelRatio());
    const d = st.drawn;
    if (d && d.page === page && d.theme === t && d.scale > 0 && Math.abs(d.scale - want) / want < 0.03) {
      scheduleDetail();
      return;
    }
    const token = ++st.tokens.render;
    try {
      if (!d || d.page !== page || d.theme !== t || d.scale === 0) {
        const any = R.anyCached(page);
        if (any) draw(any, t);
        else {
          if (!d || d.page !== page) blank();
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

  function scheduleDetail(): void {
    clearTimeout(st.timers.detail);
    st.timers.detail = window.setTimeout(() => void renderDetail(), DETAIL_MS);
  }

  /** Past the bitmap cap (deep zoom), render the visible region crisply. */
  async function renderDetail(): Promise<void> {
    const R = st.renderer;
    const L = currentLayout();
    if (!R || !L || !st.drawn || !st.size) return;
    const pr = pixelRatio();
    const want = L.ds * pr;
    if (st.drawn.scale >= want * 0.97) {
      st.detail = null;
      applyTransform();
      return;
    }
    const mx = VP.w * 0.3;
    const my = VP.h * 0.3;
    const x0 = clamp(-L.x - mx, 0, L.pw);
    const y0 = clamp(-L.y - my, 0, L.ph);
    const x1 = clamp(-L.x + VP.w + mx, 0, L.pw);
    const y1 = clamp(-L.y + VP.h + my, 0, L.ph);
    const d = st.detail;
    const visible = { x0: clamp(-L.x, 0, L.pw), y0: clamp(-L.y, 0, L.ph), x1: clamp(VP.w - L.x, 0, L.pw), y1: clamp(VP.h - L.y, 0, L.ph) };
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
    for (const n of [from + 1, from + 2, from - 1]) {
      if (n < 1 || n > st.pageCount || st.page !== from) continue;
      if (performance.now() - st.lastMoveAt < PREFETCH_MS) return schedulePrefetch();
      try {
        const size = await R.size(n);
        const fit = fitFor(size);
        const g = fit === 'page' ? 0 : GUTTER_PX[settingsRef.current.gutters];
        const ds = fitScale(size, VP, fit, g) * st.v.zoom;
        await R.render(n, PageRenderer.capScale(size, ds * pixelRatio()));
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
    if (!st.size) return;
    st.v = clampView(st.size, VP, st.fit, gutter(), v);
    moved(zoomed);
  }

  function anchor(): { x: number; y: number } {
    const p = st.pointer;
    // Zoom about the pointer if a trackpad touched it in the last 2 s (§6.4).
    return p && performance.now() - p.at < 2000 ? { x: p.x, y: p.y } : { x: VP.w / 2, y: VP.h / 2 };
  }

  function zoomTo(z: number, at = anchor()): void {
    if (!st.size) return;
    st.v = zoomAbout(st.size, VP, st.fit, gutter(), st.v, z, at);
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
    const target = clamp(n, 1, st.pageCount);
    const token = ++st.tokens.nav;
    const size = await R.size(target);
    if (token !== st.tokens.nav) return;
    const changed = target !== st.page;
    st.page = target;
    st.size = size;
    st.fit = fitFor(size);
    st.tween = null;
    st.bumpArmed = null;
    st.detail = null;
    st.v = clampView(size, VP, st.fit, gutter(), { zoom: st.v.zoom, panX: st.v.panX, scrollY: land === 'top' ? 0 : Number.MAX_SAFE_INTEGER });
    void ensureRender();
    applyTransform();
    if (changed && dir !== 0 && settingsRef.current.pageTransition === 'slide') {
      animate(slideRef.current, [{ transform: `translateX(${dir * 60}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }], 120);
    }
    if (changed) {
      toast.notePageTurn();
      input.rumble('tick');
    }
    persistNow();
    rerender();
  }

  function turn(d: -1 | 1): void {
    const next = st.page + d;
    if (next < 1 || next > st.pageCount) return bump(d);
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
    const next = st.page + d;
    if (st.bumpArmed === d && next >= 1 && next <= st.pageCount) {
      st.bumpArmed = null;
      void gotoPage(next, d > 0 ? 'top' : 'bottom', d);
      return;
    }
    st.bumpArmed = d;
    bump(d);
  }

  function stageJump(d: -1 | 1): void {
    const list = stagesRef.current;
    const cur = stageForPage(list, st.page);
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
    const L = currentLayout();
    const frac = L ? scrollFraction(L, st.v) : 0;
    st.fit = f;
    st.fitChosen = true;
    st.detail = null;
    const v = clampView(st.size, VP, f, gutter(), { zoom: 1, panX: 0, scrollY: 0 });
    const L2 = layout(st.size, VP, f, gutter(), v);
    st.v = clampView(st.size, VP, f, gutter(), { ...v, scrollY: frac * L2.maxScroll });
    moved(true);
    persistNow();
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
      ...(st.themeOverride ? { themeOverride: st.themeOverride } : {}),
      orientation: 'landscape',
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
    if (session.activeMs <= 0) return;
    const s: Session = { ...session, endPage: st.page, ...(end ? { endedAt: Date.now() } : {}) };
    saveSession(s, savedActive.current);
    savedActive.current = session.activeMs;
  }

  function leave(): void {
    persistNow();
    saveSessionNow(true);
    nav.pop();
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
        const size = await renderer.size(start);
        if (cancelled) return;
        st.page = start;
        st.size = size;
        st.fitChosen = !!saved?.fitChosen;
        st.fit = saved?.fit ?? 'width';
        st.fit = fitFor(size);
        st.themeOverride = saved?.themeOverride;
        st.v = clampView(size, VP, st.fit, gutter(), { zoom: saved?.zoom ?? 1, panX: 0, scrollY: 0 });
        if (saved && !jumpTo) {
          const L = layout(size, VP, st.fit, gutter(), st.v);
          st.v = clampView(size, VP, st.fit, gutter(), { ...st.v, scrollY: saved.scrollY * L.maxScroll });
        }
        session.startPage = start;
        setStatus({ kind: 'ready' });
        blank();
        void ensureRender();
        persistNow();
        const b = store.get().books[bookId];
        if (b && (!b.indexedAt || !b.thumbAt)) indexWithDoc(bookId, doc).catch((e) => console.warn('index in reader failed', e));
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
      if (!document.hidden && document.hasFocus() && performance.now() - input.lastInputAt() < GAME.idleCapMs) session.activeMs += 1000;
      if (++n % 10 === 0) {
        persistNow();
        saveSessionNow(false);
      }
      if (hudRef.current) rerender();
    }, 1000);
    const off = api.onPower((e) => {
      if (e === 'suspend') {
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

  // Settings that change the page: gutters, theme, default fit.
  useEffect(() => {
    if (!st.size || !st.renderer) return;
    st.fit = fitFor(st.size);
    st.v = clampView(st.size, VP, st.fit, gutter(), st.v);
    st.detail = null;
    applyTransform();
    void ensureRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.gutters, settings.pageTheme, settings.defaultFit, stageScale]);

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
            return setFit(nextFit(st.fit, false));
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
          st.v = zoomAbout(st.size, VP, st.fit, gutter(), st.v, st.v.zoom * zoomFactor(a.zoom, dt), anchor());
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
  const progress = st.pageCount ? st.page / st.pageCount : 0;
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
              aria-label={`PDF page ${st.page}`}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transformOrigin: '0 0',
                willChange: 'transform',
                boxShadow: '0 0 60px rgba(0,0,0,0.6)',
                background: THEME_BG[t],
                visibility: status.kind === 'ready' ? 'visible' : 'hidden',
              }}
            >
              <canvas ref={baseRef} style={{ display: 'block' }} />
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
            {st.page} / {st.pageCount}
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
          pageCount={st.pageCount}
          fit={st.fit}
          zoom={st.v.zoom}
          theme={t}
          bookmarks={bookmarks ?? []}
          sessionMs={session.activeMs}
          showXp={game.showXp}
        />
      ) : null}

      {overlay === 'display' ? (
        <DisplaySheet
          theme={t}
          fit={st.fit}
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
