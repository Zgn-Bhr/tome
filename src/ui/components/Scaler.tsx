// Uniform scaling for docked / external displays (§2): s = min(w/1280, h/800),
// centred and letterboxed with bg.base. The reader renders at s × DPR so the
// page stays sharp on bigger screens.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { C, STAGE_H, STAGE_W } from '../tokens';

const ScaleCtx = createContext(1);

export function useStageScale(): number {
  return useContext(ScaleCtx);
}

export function Scaler({ children, reduceMotion }: { children: ReactNode; reduceMotion: boolean }) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const s = Math.min(size.w / STAGE_W, size.h / STAGE_H);
  return (
    <ScaleCtx.Provider value={s}>
      <div style={{ position: 'fixed', inset: 0, background: C.bgBase, overflow: 'hidden' }}>
        <div
          className={reduceMotion ? 'reduce-motion' : undefined}
          style={{
            position: 'absolute',
            left: (size.w - STAGE_W * s) / 2,
            top: (size.h - STAGE_H * s) / 2,
            width: STAGE_W,
            height: STAGE_H,
            transform: `scale(${s})`,
            transformOrigin: '0 0',
            overflow: 'hidden',
            background: C.bgBase,
          }}
        >
          {children}
        </div>
      </div>
    </ScaleCtx.Provider>
  );
}
