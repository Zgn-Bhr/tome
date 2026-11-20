// Overlays and dialogs: D-pad moves focus, A confirms, B closes, and they
// capture all input while open (§6.3).

import type { ReactNode } from 'react';
import { C, chakra } from '../tokens';
import { PromptItem, type Prompt } from './Glyph';

export function Scrim({ children, dim = 0.72, onTop = 50 }: { children: ReactNode; dim?: number; onTop?: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: onTop, background: `rgba(7,9,15,${dim})`, animation: 'fade-in 150ms ease-out' }}>{children}</div>
  );
}

export function Dialog({ title, children, prompts, width = 520 }: { title: string; children: ReactNode; prompts: Prompt[]; width?: number }) {
  return (
    <Scrim>
      <div
        role="dialog"
        aria-label={title}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width,
          transform: 'translate(-50%, -50%)',
          padding: '28px 30px 24px',
          borderRadius: 24,
          background: C.surfaceModal,
          border: `1px solid ${C.line3}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <h2 style={{ margin: 0, font: chakra(700, 22), letterSpacing: '0.08em' }}>{title}</h2>
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22, marginTop: 4 }}>
          {prompts.map((p) => (
            <PromptItem key={p.label} p={p} size={14} gap={9} />
          ))}
        </div>
      </div>
    </Scrim>
  );
}

export interface MenuRow {
  id: string;
  label: string;
  /** Enum value shown on the right; ←/→ change it in place. */
  value?: string;
  /** The value is a plain label, not an enum (no ‹ › arrows). */
  tag?: boolean;
  hint?: string;
  disabled?: boolean;
}

export function MenuList({ rows, focused, width }: { rows: MenuRow[]; focused: string; width?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width }}>
      {rows.map((r) => {
        const f = r.id === focused;
        return (
          <div
            key={r.id}
            className={`focusable${f ? ' is-focused' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              minHeight: 48,
              padding: '10px 16px',
              borderRadius: 12,
              background: f ? C.surface1 : 'transparent',
              border: `1px solid ${f ? C.line3 : 'transparent'}`,
              opacity: r.disabled ? 0.45 : 1,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span className="ellipsis" style={{ fontSize: 15, fontWeight: 600, color: f ? C.textPrimary : C.textSecondary }}>
                {r.label}
              </span>
              {r.hint ? (
                <span className="ellipsis" style={{ fontSize: 12, color: C.textDim }}>
                  {r.hint}
                </span>
              ) : null}
            </div>
            {r.value !== undefined ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: chakra(600, 13), letterSpacing: '0.06em', color: f ? C.cyan : C.textMuted, flex: 'none' }}>
                {f && !r.tag ? '‹' : ''} {r.value} {f && !r.tag ? '›' : ''}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Right-side sheet, 360 px wide (Display menu, §7.8). */
export function Sheet({ title, children, prompts }: { title: string; children: ReactNode; prompts: Prompt[] }) {
  return (
    <Scrim dim={0.45}>
      <aside
        aria-label={title}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          padding: '28px 20px 20px',
          background: C.surfaceModal,
          borderLeft: `1px solid ${C.line3}`,
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          animation: 'sheet-in 150ms ease-out',
        }}
      >
        <h2 style={{ margin: '0 6px', font: chakra(700, 18), letterSpacing: '0.12em' }}>{title}</h2>
        <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '10px 18px' }}>
          {prompts.map((p) => (
            <PromptItem key={p.label} p={p} size={13} gap={8} />
          ))}
        </div>
      </aside>
    </Scrim>
  );
}
