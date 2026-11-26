import { useCallback, useEffect, useMemo, useState } from 'react';
import { bootstrap } from './actions';
import { api } from './api';
import { InputProvider, useInput, useInputApi } from './input/InputProvider';
import { NavCtx, type Nav, type Route } from './nav';
import { store, useApp } from './store';
import { C, chakra } from './tokens';
import { Scaler } from './components/Scaler';
import { ToastProvider, useToast } from './components/Toast';
import { Dialog } from './components/Overlay';
import { Spinner } from './components/Icons';
import { LibraryScreen } from './screens/LibraryScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import { ReaderScreen } from './screens/reader/ReaderScreen';
import { FolderPicker } from './screens/FolderPicker';
import { SettingsOverlay } from './screens/SettingsOverlay';
import { SessionComplete } from './screens/SessionComplete';
import { SearchScreen } from './screens/SearchScreen';

export function App() {
  const reduceMotion = useApp((s) => s.settings.reduceMotion);
  useEffect(() => {
    void bootstrap();
  }, []);
  return (
    <InputProvider>
      <Scaler reduceMotion={reduceMotion}>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </Scaler>
    </InputProvider>
  );
}

type Overlay = null | 'quit' | 'settings' | 'folders';

function Root() {
  const ready = useApp((s) => s.ready);
  const firstRun = useApp((s) => s.firstRun);
  const scanning = useApp((s) => s.scanning);
  const bookCount = useApp((s) => Object.keys(s.books).length);
  const debug = useApp((s) => s.settings.debugOverlay);
  const [stack, setStack] = useState<Route[]>([{ name: 'library', tab: 'home' }]);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const toast = useToast();

  const nav: Nav = useMemo(
    () => ({
      stack,
      push: (r) => setStack((s) => [...s, r]),
      pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      replace: (r) => setStack((s) => [...s.slice(0, -1), r]),
      openBook: (bookId, jumpTo) => {
        const b = store.get().books[bookId];
        if (!b?.available) {
          toast.show({ kind: 'neutral', eyebrow: 'NOT AVAILABLE', line: "This file can't be found right now" });
          return;
        }
        setStack((s) => [...s, { name: 'reader', bookId, ...(jumpTo ? { jumpTo } : {}) }]);
      },
      openDetails: (bookId) => setStack((s) => [...s, { name: 'details', bookId }]),
      showQuit: () => setOverlay('quit'),
      showSettings: () => setOverlay('settings'),
      showFolderPicker: () => setOverlay('folders'),
    }),
    [stack, toast],
  );

  // Pause background indexing while the reader is open (battery, §12).
  const top = stack[stack.length - 1]!;
  useEffect(() => {
    store.set(() => ({ reading: top.name === 'reader' }));
  }, [top.name]);

  // Flush on suspend is handled by the reader; here we just log for the debug overlay.
  useEffect(() => api.onPower((e) => console.info('power', e)), []);

  // Dev toggle for the debug overlay: Ctrl+Shift+D.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        store.set((s) => ({ settings: { ...s.settings, debugOverlay: !s.settings.debugOverlay } }));
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);

  if (!ready) return <Loading />;

  const needsFolder = firstRun && bookCount === 0 && !scanning;
  let screen;
  if (needsFolder) screen = <FolderPicker firstRun onClose={closeOverlay} />;
  else if (top.name === 'library') screen = <LibraryScreen key="library" route={top} />;
  else if (top.name === 'details') screen = <DetailsScreen key={`details-${top.bookId}`} bookId={top.bookId} />;
  else if (top.name === 'session') screen = <SessionComplete key="session" s={top.summary} />;
  else if (top.name === 'search') screen = <SearchScreen key="search" />;
  else screen = <ReaderScreen key={`reader-${top.bookId}-${stack.length}`} bookId={top.bookId} {...(top.jumpTo ? { jumpTo: top.jumpTo } : {})} />;

  return (
    <NavCtx.Provider value={nav}>
      {screen}
      {overlay === 'quit' ? <QuitConfirm onClose={closeOverlay} /> : null}
      {overlay === 'settings' ? <SettingsOverlay onClose={closeOverlay} onAddFolder={() => setOverlay('folders')} /> : null}
      {overlay === 'folders' && !needsFolder ? <FolderPicker onClose={closeOverlay} /> : null}
      {debug ? <DebugOverlay /> : null}
    </NavCtx.Provider>
  );
}

function Loading() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, font: chakra(600, 16), letterSpacing: '0.16em', color: C.textMuted }}>
      <Spinner /> TOME
    </div>
  );
}

function QuitConfirm({ onClose }: { onClose: () => void }) {
  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (e.action === 'confirm') void api.quit();
      if (e.action === 'back') onClose();
    },
  });
  return (
    <Dialog
      title="QUIT TOME?"
      width={460}
      prompts={[
        { glyphs: ['A'], label: 'Quit' },
        { glyphs: ['B'], label: 'Cancel' },
      ]}
    >
      <span style={{ fontSize: 15, color: C.textSecondary }}>Your place in every book is saved.</span>
    </Dialog>
  );
}

function DebugOverlay() {
  const input = useInputApi();
  const [pads, setPads] = useState<string[]>([]);
  useEffect(() => {
    const t = setInterval(() => setPads(input.gamepads()), 500);
    return () => clearInterval(t);
  }, [input]);
  const env = useApp((s) => s.env);
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 72,
        zIndex: 200,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.8)',
        font: '12px/1.5 ui-monospace, Menlo, monospace',
        color: '#9fe',
        maxWidth: 700,
        pointerEvents: 'none',
      }}
    >
      <div>gamepads: {pads.length ? '' : 'none (press a button)'}</div>
      {pads.map((p) => (
        <div key={p}>{p}</div>
      ))}
      <div>
        gameMode={String(env?.gameMode)} platform={env?.platform} data={env?.dataDir}
      </div>
    </div>
  );
}
