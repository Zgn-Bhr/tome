// Toasts (§7.10): top-right, one at a time, never within 1.5 s of a page turn.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { C, chakra } from '../tokens';
import { Hex } from './Game';
import { BookmarkIcon, Check } from './Icons';

export interface ToastSpec {
  kind: 'gold' | 'neutral';
  eyebrow: string;
  line: string;
  value?: string;
}

interface ToastApi {
  show(t: ToastSpec): void;
  /** Call on every page turn; toasts wait 1.5 s after the last one. */
  notePageTurn(): void;
}

const Ctx = createContext<ToastApi>({ show: () => {}, notePageTurn: () => {} });

const HOLD_MS = 4000;
const OUT_MS = 200;
const QUIET_AFTER_TURN_MS = 1500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const queue = useRef<ToastSpec[]>([]);
  const lastTurn = useRef(0);
  const [current, setCurrent] = useState<{ t: ToastSpec; leaving: boolean; key: number } | null>(null);
  const busy = useRef(false);
  const keyRef = useRef(0);

  const pump = useCallback(() => {
    if (busy.current || queue.current.length === 0) return;
    const wait = lastTurn.current + QUIET_AFTER_TURN_MS - performance.now();
    if (wait > 0) {
      setTimeout(pump, wait + 10);
      return;
    }
    busy.current = true;
    const t = queue.current.shift()!;
    const key = ++keyRef.current;
    setCurrent({ t, leaving: false, key });
    setTimeout(() => setCurrent((c) => (c && c.key === key ? { ...c, leaving: true } : c)), HOLD_MS);
    setTimeout(() => {
      setCurrent((c) => (c && c.key === key ? null : c));
      busy.current = false;
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
  });

  return (
    <Ctx.Provider value={api.current}>
      {children}
      {current ? <ToastView key={current.key} t={current.t} leaving={current.leaving} /> : null}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(Ctx);
}

function ToastView({ t, leaving }: { t: ToastSpec; leaving: boolean }) {
  const gold = t.kind === 'gold';
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 24,
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
          <BookmarkIcon />
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
