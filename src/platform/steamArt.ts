// Puts Tome's library artwork on its Steam shortcut (spec M6), so nobody has to
// set it by hand. Runs a few seconds after every launch, and from the install
// script (`Tome.AppImage --steam-art`).
//
// - Finds the shortcut whose executable is this AppImage in each Steam user's
//   shortcuts.vdf. That file is only read: Steam rewrites it while running.
// - Copies the bundled images into that user's grid folder, only into empty
//   slots, so art people set themselves stays.
// - Remembers each shortcut it has done (steam-art.json in the data folder),
//   so art someone cleared in Steam doesn't come back.
// Steam reads the grid folder when it starts, so art added while it runs shows
// after the next restart, e.g. switching to Desktop Mode and back (verify on
// device).

import { app } from 'electron';
import { constants, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseShortcuts, planArt, unquote } from '../core/steamArt';

const RECORD_FILE = 'steam-art.json';

interface ArtRecord {
  /** "<steam user>/<shortcut id>" → when Tome added its art there. */
  done: Record<string, number>;
}

/** Steam's data folders: native (two common links to it) and Flatpak. TOME_STEAM_DIR replaces them, for development. */
function steamRoots(): string[] {
  const override = process.env.TOME_STEAM_DIR;
  if (override) return [resolve(override)];
  if (process.platform !== 'linux') return [];
  const home = homedir();
  return [
    join(home, '.local/share/Steam'),
    join(home, '.steam/steam'),
    join(home, '.steam/root'),
    join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
    join(home, '.var/app/com.valvesoftware.Steam/data/Steam'),
  ];
}

/** The bundled images (resources/steam in the repo). */
export function artDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'steam') : join(app.getAppPath(), 'resources/steam');
}

/** The AppImage being run (the AppImage runtime sets $APPIMAGE), which is what Steam's shortcut starts. */
export function appImagePath(): string | undefined {
  const p = process.env.APPIMAGE;
  return p && existsSync(p) ? p : undefined;
}

async function real(p: string): Promise<string | null> {
  try {
    return await realpath(p);
  } catch {
    return null;
  }
}

async function list(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

interface Found {
  key: string;
  appid: number;
  gridDir: string;
}

/** Every Steam user's shortcut that starts `exe`. */
async function findShortcuts(exe: string, log: (m: string) => void): Promise<Found[]> {
  const target = (await real(exe)) ?? exe;
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const root of steamRoots()) {
    const r = await real(root);
    if (!r || seen.has(r)) continue;
    seen.add(r);
    const userdata = join(r, 'userdata');
    for (const user of await list(userdata)) {
      if (!/^\d+$/.test(user)) continue;
      const config = join(userdata, user, 'config');
      let bytes: Buffer;
      try {
        bytes = await readFile(join(config, 'shortcuts.vdf'));
      } catch {
        continue; // This user has no non-Steam games.
      }
      let shortcuts;
      try {
        shortcuts = parseShortcuts(bytes);
      } catch (e) {
        log(`couldn't read ${join(config, 'shortcuts.vdf')}: ${(e as Error).message}`);
        continue;
      }
      for (const s of shortcuts) {
        if (s.appid === null || !s.exe) continue;
        const path = unquote(s.exe);
        if (path !== target && (await real(path)) !== target) continue;
        out.push({ key: `${user}/${s.appid}`, appid: s.appid, gridDir: join(config, 'grid') });
      }
    }
  }
  return out;
}

async function loadRecord(file: string): Promise<ArtRecord> {
  try {
    const r = JSON.parse(await readFile(file, 'utf8')) as ArtRecord;
    return r && typeof r.done === 'object' && r.done ? r : { done: {} };
  } catch {
    return { done: {} };
  }
}

async function saveRecord(file: string, r: ArtRecord): Promise<void> {
  await writeFile(`${file}.tmp`, JSON.stringify(r));
  await rename(`${file}.tmp`, file);
}

export interface SteamArtResult {
  /** Shortcuts found for this AppImage. */
  shortcuts: number;
  /** Images copied this time. */
  added: number;
}

export interface SteamArtOptions {
  dataDir: string;
  /** The AppImage Steam's shortcut points at. */
  exe: string;
  /** Keep looking for this many seconds if Steam hasn't saved the shortcut yet (the installer adds it just before). */
  waitSec?: number;
  log?: (m: string) => void;
}

export async function applySteamArt(opts: SteamArtOptions): Promise<SteamArtResult> {
  const log = opts.log ?? ((m: string) => console.log(`[steam-art] ${m}`));
  const deadline = Date.now() + (opts.waitSec ?? 0) * 1000;
  let found = await findShortcuts(opts.exe, log);
  while (!found.length && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    found = await findShortcuts(opts.exe, log);
  }
  if (!found.length) return { shortcuts: 0, added: 0 };

  const recordFile = join(opts.dataDir, RECORD_FILE);
  const record = await loadRecord(recordFile);
  const source = artDir();
  let added = 0;
  for (const s of found) {
    if (record.done[s.key]) continue;
    const plan = planArt(s.appid, await list(s.gridDir));
    if (plan.length) await mkdir(s.gridDir, { recursive: true });
    let failed = false;
    for (const c of plan) {
      try {
        // COPYFILE_EXCL: never overwrite, even if Steam or the user wrote the file a moment ago.
        await copyFile(join(source, c.source), join(s.gridDir, c.target), constants.COPYFILE_EXCL);
        added++;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue;
        log(`couldn't copy ${c.source} to ${join(s.gridDir, c.target)}: ${(e as Error).message}`);
        failed = true;
      }
    }
    if (!failed) record.done[s.key] = Date.now();
    log(plan.length ? `shortcut ${s.appid}: added ${plan.map((c) => c.slot).join(', ')}` : `shortcut ${s.appid}: already has artwork`);
  }
  await mkdir(dirname(recordFile), { recursive: true });
  await saveRecord(recordFile, record);
  return { shortcuts: found.length, added };
}

/** Copies the app icon to `dest`, for the install script's menu entry. */
export async function exportIcon(dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(artDir(), 'icon.png'), `${dest}.tmp`);
  await rename(`${dest}.tmp`, dest);
}
