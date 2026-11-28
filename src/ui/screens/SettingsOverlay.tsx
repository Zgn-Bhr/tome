// Settings (§11), first pass: the rows that work today. A edits; ←/→ change
// enum values in place.

import { useMemo } from 'react';
import type { Settings } from '../../core/models';
import { columnGraph } from '../../core/input/focus';
import { checkForUpdates, downloadUpdate, rescan, restartToUpdate, updateSettings } from '../actions';
import { compactSince } from '../../core/time';
import { formatMegabytes } from '../../core/update';
import { FIT_LABEL } from '../../core/reader/viewport';
import type { UpdateState } from '../../shared/api';
import { useInput } from '../input/InputProvider';
import { useFocus } from '../focus/useFocus';
import { useApp } from '../store';
import { C, chakra } from '../tokens';
import { PromptItem } from '../components/Glyph';
import { MenuList, Scrim, type MenuRow } from '../components/Overlay';
import { useToast } from '../components/Toast';

type EnumKey = 'pageTheme' | 'gutters' | 'defaultFit' | 'pageTransition' | 'gameIntensity';
type BoolKey = 'zen' | 'haptics' | 'reduceMotion' | 'debugOverlay' | 'rescanOnLaunch' | 'includeSdCards' | 'gameManuals' | 'autoCrop' | 'checkUpdates';

const ENUMS: Record<EnumKey, { label: string; options: string[] }> = {
  pageTheme: { label: 'Page theme', options: ['paper', 'sepia', 'night', 'dim'] },
  gutters: { label: 'Gutters', options: ['wide', 'narrow', 'none'] },
  defaultFit: { label: 'Default fit', options: ['auto', 'width', 'page', 'spread', 'column'] },
  pageTransition: { label: 'Page transition', options: ['slide', 'instant'] },
  gameIntensity: { label: 'Game layer', options: ['full', 'light', 'off'] },
};
const BOOLS: Record<BoolKey, string> = {
  zen: 'Zen focus mode (hide counter and line)',
  autoCrop: 'Auto-crop margins',
  haptics: 'Haptics',
  reduceMotion: 'Reduce motion',
  rescanOnLaunch: 'Rescan on launch',
  includeSdCards: 'Include SD cards',
  gameManuals: 'Game manuals (ES-DE)',
  checkUpdates: 'Check for updates automatically',
  debugOverlay: 'Debug overlay',
};

const ORDER: (EnumKey | BoolKey | 'update' | 'folders' | 'rescan' | 'dailyGoal' | 'grips')[] = [
  'update',
  'folders',
  'rescan',
  'includeSdCards',
  'gameManuals',
  'rescanOnLaunch',
  'pageTheme',
  'defaultFit',
  'autoCrop',
  'gutters',
  'pageTransition',
  'zen',
  'gameIntensity',
  'dailyGoal',
  'haptics',
  'grips',
  'reduceMotion',
  'checkUpdates',
  'debugOverlay',
];

/** The Software update row: what A does is in the value on the right. */
function updateRow(u: UpdateState, version: string, now: number): MenuRow {
  const since = (t: number) => {
    const s = compactSince(t, now);
    return s === 'now' ? 'just now' : `${s} ago`;
  };
  const row = (label: string, value: string, hint: string): MenuRow => ({ id: 'update', label, value, tag: true, hint });
  switch (u.kind) {
    case 'unsupported':
      return row('Software update', `v${version}`, 'Only the AppImage (Steam Deck, Linux) updates itself');
    case 'idle':
      return row('Software update', 'CHECK NOW', `Version ${version}${u.checkedAt ? ` · checked ${since(u.checkedAt)}` : ''}`);
    case 'checking':
      return row('Software update', 'CHECKING…', `Version ${version}`);
    case 'current':
      return row('Software update', 'UP TO DATE', `Version ${version} · checked ${since(u.checkedAt)} · A checks again`);
    case 'available':
      return row(`Update to ${u.version}`, `INSTALL · ${formatMegabytes(u.size)}`, `${u.title} · you have ${version}`);
    case 'downloading':
      return row(`Downloading ${u.version}`, `${Math.floor((u.received / u.size) * 100)}%`, 'Keep reading: it installs itself when done');
    case 'ready':
      return row(`Tome ${u.version} is installed`, 'RESTART NOW', 'Or it starts with the new version next time');
    case 'error':
      return row(u.version ? `Update to ${u.version}` : 'Software update', 'TRY AGAIN', u.message);
  }
}

const VISIBLE = 8;

export function SettingsOverlay({ onClose, onAddFolder }: { onClose: () => void; onAddFolder: () => void }) {
  const s = useApp((st) => st.settings);
  const override = useApp((st) => st.env?.libraryOverride);
  const version = useApp((st) => st.env?.version ?? '');
  const update = useApp((st) => st.update);
  const toast = useToast();
  const graph = useMemo(() => columnGraph(ORDER), []);
  const { focused, navigate } = useFocus('settings', graph, update.kind === 'available' || update.kind === 'ready' ? 'update' : 'folders');

  const updateAction = () => {
    switch (update.kind) {
      case 'idle':
      case 'current':
        return checkForUpdates();
      case 'available':
        return downloadUpdate();
      case 'ready':
        return restartToUpdate();
      case 'error':
        return update.version ? downloadUpdate() : checkForUpdates();
      default:
        return; // unsupported, checking, downloading
    }
  };

  const set = (patch: Partial<Settings>) => void updateSettings(patch);
  const step = (key: string, d: 1 | -1) => {
    if (key === 'gameManuals') {
      // Off hides manuals at once; the rescan then stops reading them (or, turned on, finds them).
      const on = !s.gameManuals;
      toast.show({ kind: 'neutral', eyebrow: 'GAME MANUALS', line: on ? 'Looking for ES-DE manuals…' : 'Hidden, and skipped when scanning' });
      return void updateSettings({ gameManuals: on }).then(rescan);
    }
    if (key in ENUMS) {
      const e = ENUMS[key as EnumKey];
      const cur = e.options.indexOf(s[key as EnumKey]);
      set({ [key]: e.options[(cur + d + e.options.length) % e.options.length] } as Partial<Settings>);
    } else if (key in BOOLS) set({ [key]: !s[key as BoolKey] } as Partial<Settings>);
    else if (key === 'dailyGoal') set({ dailyGoal: Math.min(100, Math.max(10, s.dailyGoal + d * 5)) });
  };

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (e.action === 'nav_left') return step(focused, -1);
      if (e.action === 'nav_right') return step(focused, 1);
      if (navigate(e.action)) return;
      if (e.action === 'confirm') {
        if (focused === 'update') return updateAction();
        if (focused === 'folders') return onAddFolder();
        if (focused === 'rescan') {
          toast.show({ kind: 'neutral', eyebrow: 'LIBRARY', line: 'Rescanning folders…' });
          return void rescan();
        }
        if (focused === 'grips') return;
        return step(focused, 1);
      }
      if (e.action === 'back' || e.action === 'menu') onClose();
    },
  });

  const rows: MenuRow[] = ORDER.map((k) => {
    if (k === 'update') return updateRow(update, version, Date.now());
    if (k === 'folders')
      return { id: k, label: 'Library folders', value: `${s.folders.length} · ADD`, tag: true, hint: override ? 'Overridden by TOME_LIBRARY_DIRS (development)' : s.folders.join(' · ') };
    if (k === 'rescan') return { id: k, label: 'Rescan now', hint: 'Look for new, moved and removed PDFs' };
    if (k === 'dailyGoal') return { id: k, label: 'Daily goal', value: `${s.dailyGoal} PAGES` };
    if (k === 'grips') {
      const g = s.backGripKeys;
      return { id: k, label: 'Back-grip keys (Steam Input)', hint: `R4 ${g.r4} · L4 ${g.l4} · R5 ${g.r5} · L5 ${g.l5}` };
    }
    if (k === 'gameManuals')
      return {
        id: k,
        label: BOOLS.gameManuals,
        value: s.gameManuals ? 'ON' : 'OFF',
        hint: s.gameManuals ? 'Manuals from downloaded_media, shelved by system in Collections' : 'Off: manuals are skipped when scanning and hidden',
      };
    if (k === 'defaultFit') return { id: k, label: ENUMS.defaultFit.label, value: s.defaultFit === 'auto' ? 'AUTO' : FIT_LABEL[s.defaultFit] };
    if (k in ENUMS) return { id: k, label: ENUMS[k as EnumKey].label, value: String(s[k as EnumKey]).toUpperCase() };
    return { id: k, label: BOOLS[k as BoolKey], value: s[k as BoolKey] ? 'ON' : 'OFF' };
  });
  const idx = ORDER.indexOf(focused as (typeof ORDER)[number]);
  const start = Math.max(0, Math.min(rows.length - VISIBLE, idx - Math.floor(VISIBLE / 2)));

  return (
    <Scrim dim={0.6} onTop={60}>
      <div
        role="dialog"
        aria-label="Settings"
        style={{
          position: 'absolute',
          left: '50%',
          top: 40,
          bottom: 40,
          width: 680,
          transform: 'translateX(-50%)',
          padding: '26px 28px 20px',
          borderRadius: 24,
          background: C.surfaceModal,
          border: `1px solid ${C.line3}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, font: chakra(700, 22), letterSpacing: '0.1em' }}>SETTINGS</h2>
          <span style={{ fontSize: 13, color: C.textDim }}>More settings arrive in a later build</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', margin: '0 -14px', padding: '12px 14px' }}>
          <MenuList rows={rows.slice(start, start + VISIBLE)} focused={focused} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22 }}>
          <PromptItem p={{ glyphs: ['Dpad'], label: 'Change' }} size={14} gap={9} />
          <PromptItem p={{ glyphs: ['A'], label: 'Edit' }} size={14} gap={9} />
          <PromptItem p={{ glyphs: ['B'], label: 'Close' }} size={14} gap={9} />
        </div>
      </div>
    </Scrim>
  );
}
