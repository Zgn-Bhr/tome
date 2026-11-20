// Electron main process: window, tome:// protocol, IPC, power events.

import { app, BrowserWindow, ipcMain, Menu, powerMonitor, protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { Bookmark, ReadingState, Session, Settings, Stage } from '../core/models';
import { IPC, SCHEME, type AppEnv, type Bootstrap, type BookMetaUpdate, type PowerEvent } from '../shared/api';
import { TomeDb } from './db';
import { listDir, scanLibrary } from './library';
import { dataDir, libraryOverride } from './paths';
import { SettingsStore } from './settings';
import { runSmoke } from './smoke';

const isDev = !app.isPackaged;
const rendererDir = join(import.meta.dirname, '../renderer');
const BOOK_ID = /^[0-9a-f]{40}$/;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

/** Fullscreen in Game Mode, or when asked (verify which env vars gamescope sets on device). */
function wantsFullscreen(): boolean {
  if (process.argv.includes('--windowed')) return false;
  return (
    process.argv.includes('--fullscreen') ||
    !!process.env.SteamGamepadUI ||
    !!process.env.GAMESCOPE_WAYLAND_DISPLAY ||
    process.env.SteamDeck === '1'
  );
}

let db: TomeDb;
let settings: SettingsStore;
let dir: string;
let win: BrowserWindow | null = null;
let scanning: Promise<void> | null = null;

function env(): AppEnv {
  return {
    platform: process.platform,
    gameMode: !!(process.env.SteamGamepadUI || process.env.GAMESCOPE_WAYLAND_DISPLAY),
    isDev,
    dataDir: dir,
    homeDir: homedir(),
    libraryOverride: libraryOverride() !== null,
  };
}

function rescan(): Promise<void> {
  scanning ??= scanLibrary(db, settings.get()).finally(() => {
    scanning = null;
  });
  return scanning;
}

// ── tome:// protocol ─────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length',
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

const notFound = () => new Response('Not found', { status: 404, headers: CORS });

async function servePdf(id: string, range: string | null): Promise<Response> {
  if (!BOOK_ID.test(id)) return notFound();
  const path = db.bookPath(id);
  if (!path) return notFound();
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return notFound();
  }
  const base = { ...CORS, 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes' };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
    });
  }
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(body, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
}

async function serveFile(file: string, extra: Record<string, string> = {}): Promise<Response> {
  try {
    const data = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    return new Response(data, { status: 200, headers: { ...CORS, 'Content-Type': type, ...extra } });
  } catch {
    return notFound();
  }
}

function registerProtocol(): void {
  protocol.handle(SCHEME, async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.host !== 'app') return notFound();
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/__pdf/')) return servePdf(p.slice('/__pdf/'.length), req.headers.get('range'));
    if (p.startsWith('/__thumb/')) {
      const id = p.slice('/__thumb/'.length).replace(/\.webp$/, '');
      return BOOK_ID.test(id) ? serveFile(join(dir, 'thumbs', `${id}.webp`), { 'Cache-Control': 'max-age=31536000' }) : notFound();
    }
    // Static renderer files (production).
    const rel = normalize(p === '/' ? '/index.html' : p).replace(/^[/\\]+/, '');
    const file = join(rendererDir, rel);
    if (!file.startsWith(rendererDir + sep)) return notFound();
    return serveFile(file, file.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {});
  });
}

// ── IPC ──────────────────────────────────────────────────────────────────

function assertId(id: unknown): string {
  if (typeof id !== 'string' || !BOOK_ID.test(id)) throw new Error('bad book id');
  return id;
}

function registerIpc(): void {
  ipcMain.handle(IPC.bootstrap, (): Bootstrap => {
    const s = settings.get();
    return {
      env: env(),
      settings: s,
      firstRun: !settings.saved,
      books: db.books(),
      stages: db.stages(),
      readingStates: db.readingStates(),
      bookmarks: db.bookmarks(),
      stats: db.bookStats(),
      xpEvents: db.xpEvents(),
      pagesByDay: db.pagesByDay(),
    };
  });
  ipcMain.handle(IPC.scanLibrary, async () => {
    await rescan();
    return { books: db.books(), stages: db.stages() };
  });
  ipcMain.handle(IPC.setBookMeta, (_e, id: unknown, meta: BookMetaUpdate, stages: Stage[]) => {
    db.setBookMeta(assertId(id), meta, stages);
  });
  ipcMain.handle(IPC.saveThumb, async (_e, id: unknown, data: Uint8Array) => {
    const bookId = assertId(id);
    const file = join(dir, 'thumbs', `${bookId}.webp`);
    await writeFile(`${file}.tmp`, data);
    await rename(`${file}.tmp`, file);
    const at = Date.now();
    db.setThumb(bookId, at);
    return at;
  });
  ipcMain.handle(IPC.saveReadingState, (_e, s: ReadingState) => {
    assertId(s.bookId);
    db.saveReadingState(s);
  });
  ipcMain.handle(IPC.markOpened, (_e, id: unknown) => {
    const at = Date.now();
    db.markOpened(assertId(id), at);
    return at;
  });
  ipcMain.handle(IPC.addBookmark, (_e, b: Bookmark) => {
    assertId(b.bookId);
    db.addBookmark(b);
  });
  ipcMain.handle(IPC.removeBookmark, (_e, id: string) => db.removeBookmark(String(id)));
  ipcMain.handle(IPC.saveSession, (_e, s: Session) => {
    assertId(s.bookId);
    db.saveSession(s);
  });
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => settings.set(patch));
  ipcMain.handle(IPC.listDir, (_e, path?: string) => listDir(typeof path === 'string' ? path : undefined));
  ipcMain.handle(IPC.quit, () => {
    app.quit();
  });
}

// ── Window ───────────────────────────────────────────────────────────────

function createWindow(): void {
  const fullscreen = wantsFullscreen();
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    minWidth: 640,
    minHeight: 400,
    fullscreen,
    show: false,
    backgroundColor: '#0D1120',
    autoHideMenuBar: true,
    title: 'Tome',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => {
    win = null;
  });
  // Never navigate away or open windows; external links stay closed (§8.9).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault();
  });
  if (process.env.TOME_OPEN_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (isDev && devUrl) void win.loadURL(devUrl);
  else void win.loadURL(`${SCHEME}://app/index.html`);

  const smoke = process.env.TOME_SMOKE;
  if (isDev && smoke) {
    const w = win;
    w.webContents.once('did-finish-load', () => void runSmoke(w, smoke));
  }
}

function sendPower(e: PowerEvent): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.power, e);
}

app.whenReady().then(() => {
  dir = dataDir();
  db = new TomeDb(join(dir, 'tome.db'));
  settings = new SettingsStore(dir);
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  registerProtocol();
  registerIpc();
  createWindow();
  powerMonitor.on('suspend', () => sendPower('suspend'));
  powerMonitor.on('resume', () => sendPower('resume'));
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => db?.close());
process.on('SIGTERM', () => app.quit());
