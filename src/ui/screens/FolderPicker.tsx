// In-app folder picker (§7.8 First run): the system dialog is unusable in
// Game Mode. Pre-lists Home, Documents, Downloads and SD cards.

import { useEffect, useMemo, useState } from 'react';
import type { DirListing } from '../../shared/api';
import { columnGraph, mergeGraphs, type FocusGraph } from '../../core/input/focus';
import { addFolder } from '../actions';
import { api } from '../api';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useApp } from '../store';
import { C, FONT, chakra } from '../tokens';
import { PromptBar } from '../components/Glyph';
import { Eyebrow } from '../components/Game';
import { BookLogo, Check, ChevronLeft, Folder, Spinner } from '../components/Icons';
import { useToast } from '../components/Toast';

const VISIBLE = 9;

export function FolderPicker({ firstRun = false, onClose }: { firstRun?: boolean; onClose: () => void }) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [adding, setAdding] = useState(false);
  const folders = useApp((s) => s.settings.folders);
  const scanning = useApp((s) => s.scanning);
  const home = useApp((s) => s.env?.homeDir);
  const toast = useToast();

  const open = (path?: string) => {
    void api.listDir(path).then(setListing);
  };
  useEffect(() => open(), []);

  const rows = useMemo(() => {
    if (!listing) return [];
    const out: { id: string; kind: 'use' | 'up' | 'dir'; label: string; path: string }[] = [{ id: 'use', kind: 'use', label: 'Use this folder', path: listing.path }];
    if (listing.parent) out.push({ id: 'up', kind: 'up', label: 'Up one level', path: listing.parent });
    listing.dirs.forEach((d, i) => out.push({ id: `d:${i}`, kind: 'dir', label: d.name, path: d.path }));
    return out;
  }, [listing]);
  const roots = listing?.roots ?? [];

  const graph = useMemo(() => {
    const left = roots.map((_, i) => `r:${i}`);
    const right = rows.map((r) => r.id);
    let g: FocusGraph = mergeGraphs(columnGraph(left), columnGraph(right));
    left.forEach((id) => (g[id] = { ...g[id], ...(right[0] ? { right: right[0] } : {}) }));
    right.forEach((id) => (g[id] = { ...g[id], ...(left[0] ? { left: left[0] } : {}) }));
    return g;
  }, [rows, roots]);
  const { focused, setFocused, navigate } = useFocus('folder-picker', graph, 'use');

  const add = async (path: string) => {
    setAdding(true);
    try {
      await addFolder(path);
      toast.show({ kind: 'neutral', eyebrow: 'FOLDER ADDED', line: path.split('/').pop() || path });
      onClose();
    } finally {
      setAdding(false);
    }
  };

  const goUp = () => {
    if (listing?.parent) {
      open(listing.parent);
      setFocused('use');
    } else if (!firstRun) onClose();
  };

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (adding) return;
      if (navigate(e.action)) return;
      if (e.action === 'confirm') {
        if (focused.startsWith('r:')) {
          const r = roots[Number(focused.slice(2))];
          if (r) {
            open(r.path);
            setFocused('use');
          }
          return;
        }
        const row = rows.find((r) => r.id === focused);
        if (!row) return;
        if (row.kind === 'use') void add(row.path);
        else {
          open(row.path);
          setFocused('use');
        }
      }
      if (e.action === 'secondary' && listing) void add(listing.path);
      if (e.action === 'back') goUp();
      if (e.action === 'menu' && !firstRun) onClose();
    },
  });

  const focusIdx = rows.findIndex((r) => r.id === focused);
  const start = Math.max(0, Math.min(rows.length - VISIBLE, focusIdx - Math.floor(VISIBLE / 2)));
  const visible = rows.slice(start, start + VISIBLE);
  const expand = (f: string) => (home && (f === '~' || f.startsWith('~/')) ? home + f.slice(1) : f);
  const added = listing ? folders.map(expand).includes(listing.path) : false;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: firstRun ? 0 : 60, display: 'flex', flexDirection: 'column', background: C.bgBase }}>
      <header style={{ height: 76, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 40px', borderBottom: `1px solid ${C.line1}` }}>
        <BookLogo />
        <span style={{ font: chakra(700, 22), letterSpacing: '0.18em' }}>TOME</span>
      </header>
      <main style={{ flex: 1, minHeight: 0, display: 'flex', gap: 40, padding: '32px 40px 24px' }}>
        <aside style={{ width: 340, flex: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Eyebrow>{firstRun ? 'WELCOME' : 'LIBRARY FOLDERS'}</Eyebrow>
          <h1 style={{ margin: 0, font: chakra(600, 32, 1.1) }}>Add a folder with PDFs</h1>
          <span style={{ fontSize: 15, lineHeight: 1.5, color: C.textMuted }}>
            {firstRun ? 'Nothing turned up in Documents or Downloads. ' : ''}Tome reads every PDF in the folder you add, including subfolders. Files stay where they are.
          </span>
          <span style={{ marginTop: 14, font: chakra(600, 12), letterSpacing: '0.16em', color: C.textDim }}>PLACES</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {roots.map((r, i) => {
              const f = focused === `r:${i}`;
              return (
                <div
                  key={r.path}
                  className={`focusable${f ? ' is-focused' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, height: 48, padding: '0 16px', borderRadius: 12, background: f ? C.surface1 : 'transparent', border: `1px solid ${f ? C.line3 : 'transparent'}` }}
                >
                  <Folder size={20} color={f ? C.cyan : C.textMuted} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: f ? C.textPrimary : C.textSecondary }}>{r.label}</span>
                </div>
              );
            })}
          </div>
        </aside>
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
            <span className="ellipsis" style={{ font: `500 14px/1.3 ${FONT.mono}`, color: C.textSecondary }}>
              {listing?.path ?? '…'}
            </span>
            <span style={{ flex: 'none', fontSize: 13, color: C.textDim }}>
              {listing ? `${listing.pdfCount} PDF${listing.pdfCount === 1 ? '' : 's'} here · ${listing.dirs.length} folder${listing.dirs.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, borderRadius: 18, background: C.surface1, border: `1px solid ${C.line2}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {listing?.error ? <span style={{ padding: 12, fontSize: 14, color: C.textMuted }}>Can't open this folder: {listing.error}</span> : null}
            {visible.map((r) => {
              const f = r.id === focused;
              return (
                <div
                  key={r.id}
                  className={`focusable${f ? ' is-focused' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 48,
                    padding: '0 16px',
                    borderRadius: 12,
                    background: r.kind === 'use' ? C.goldSurface : f ? C.surfaceButton2 : 'transparent',
                    border: `1px solid ${r.kind === 'use' ? C.goldBorder : 'transparent'}`,
                  }}
                >
                  {r.kind === 'use' ? <Check size={18} color={C.gold} /> : r.kind === 'up' ? <ChevronLeft size={18} color={C.textMuted} /> : <Folder size={20} color={f ? C.cyan : C.textMuted} />}
                  <span className="ellipsis" style={{ fontSize: 15, fontWeight: 600, color: r.kind === 'use' ? C.gold : f ? C.textPrimary : C.textSecondary }}>
                    {r.label}
                  </span>
                  {r.kind === 'use' && added ? <span style={{ marginLeft: 'auto', fontSize: 12, color: C.goldTextSoft }}>already in your library</span> : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <PromptBar
        left={adding || scanning ? <><Spinner size={16} /> Scanning…</> : null}
        prompts={[
          { glyphs: ['A'], label: focused === 'use' ? 'Add folder' : 'Open' },
          { glyphs: ['X'], label: 'Add this folder' },
          { glyphs: ['B'], label: listing?.parent ? 'Up' : firstRun ? 'Up' : 'Close' },
        ]}
      />
    </div>
  );
}
