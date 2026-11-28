// Toasts (§7.10): top-right, one at a time, never within 1.5 s of a page turn.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { C, chakra } from '../tokens';
import { Hex } from './Game';
import { BookmarkIcon, Check, DownloadIcon, Folder } from './Icons';

export interface ToastSpec {
  kind: 'gold' | 'neutral';
  eyebrow: string;
  line: string;
  value?: string;
  /** Neutral toasts: bookmark (default), shelf (collections, folders) or update. */
  icon?: 'bookmark' | 'shelf' | 'update';
}

interface ToastApi {
  show(t: ToastSpec): void;
  /** Call on every page turn; toasts wait 1.5 s after the last one. */
  notePageTurn(): void;
  /** Drop the queue and the toast on screen (e.g. Session complete lists them all). */
  clear(): void;
  /** Push the toast slot down, e.g. below the reader HUD's top bar. */
  setOffset(px: number): void;
}

const Ctx = createContext<ToastApi>({ show: () => {}, notePageTurn: () => {}, clear: () => {}, setOffset: () => {} });

const HOLD_MS = 4000;
const OUT_MS = 200;
const QUIET_AFTER_TURN_MS = 1500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const queue = useRef<ToastSpec[]>([]);
  const lastTurn = useRef(0);
  const [current, setCurrent] = useState<{ t: ToastSpec; leaving: boolean; key: number } | null>(null);
  const [offset, setOffset] = useState(0);
  /** Key of the toast on screen; 0 when none. Stale timers compare against it. */
  const active = useRef(0);
  const keyRef = useRef(0);

  const pump = useCallback(() => {
    if (active.current !== 0 || queue.current.length === 0) return;
    const wait = lastTurn.current + QUIET_AFTER_TURN_MS - performance.now();
    if (wait > 0) {
      setTimeout(pump, wait + 10);
      return;
    }
    const t = queue.current.shift()!;
    const key = ++keyRef.current;
    active.current = key;
    setCurrent({ t, leaving: false, key });
    setTimeout(() => {
      if (active.current === key) setCurrent((c) => (c && c.key === key ? { ...c, leaving: true } : c));
    }, HOLD_MS);
    setTimeout(() => {
      if (active.current !== key) return;
      active.current = 0;
      setCurrent(null);
      pump();
    }, HOLD_MS + OUT_MS);
  }, []);

  const api = useRef<ToastApi>({
    show: (t) => {
      // Bookmark toggles replace each other instead of queueing.
      if (t.kind === 'neutral') queue.current = queue.current.filter((q) => q.kind !== 'neutral');
      queue.current.push(t);
      pump();
    },
    notePageTurn: () => {
      lastTurn.current = performance.now();
    },
    clear: () => {
      queue.current = [];
      active.current = 0;
      setCurrent(null);
    },
    setOffset,
  });

  return (
    <Ctx.Provider value={api.current}>
      {children}
      {current ? <ToastView key={current.key} t={current.t} leaving={current.leaving} top={24 + offset} /> : null}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(Ctx);
}

function ToastView({ t, leaving, top }: { t: ToastSpec; leaving: boolean; top: number }) {
  const gold = t.kind === 'gold';
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top,
        transition: 'top 150ms ease-out',
        right: 24,
        width: 370,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px 14px 14px',
        borderRadius: 16,
        background: C.toastBg,
        border: `1px solid ${gold ? C.goldToastBorder : C.line3}`,
        boxShadow: '0 18px 40px rgba(0,0,0,0.55)',
        animation: leaving ? `toast-out ${OUT_MS}ms ease-in forwards` : 'toast-in 250ms ease-out',
      }}
    >
      {gold ? (
        <Hex w={46} h={42} fill={C.gold}>
          <Check size={18} />
        </Hex>
      ) : (
        <Hex w={46} h={42} fill={C.line3} outline={{ w: 42, h: 38 }} inner={C.surfaceInset}>
          {t.icon === 'shelf' ? <Folder size={18} color={C.cyan} /> : t.icon === 'update' ? <DownloadIcon /> : <BookmarkIcon />}
        </Hex>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <span style={{ font: chakra(700, 12), letterSpacing: '0.16em', color: gold ? C.gold : C.cyan }}>{t.eyebrow}</span>
        <span className="ellipsis" style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary }}>
          {t.line}
        </span>
      </div>
      {t.value ? <span style={{ font: chakra(700, 20), color: C.gold }}>{t.value}</span> : null}
    </div>
  );
}
