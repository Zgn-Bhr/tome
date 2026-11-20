// Storage root and library folder resolution.

import { homedir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { app } from 'electron';

/** ~/.local/share/tome on Linux (spec §3.2); the app data folder elsewhere. TOME_DATA_DIR overrides. */
export function dataDir(): string {
  const override = process.env.TOME_DATA_DIR;
  let dir: string;
  if (override) dir = resolve(override);
  else if (process.platform === 'linux') dir = join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'tome');
  else dir = join(app.getPath('userData'), 'data');
  mkdirSync(join(dir, 'thumbs'), { recursive: true });
  return dir;
}

export function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Mounted SD cards. SteamOS mounts them under /run/media/<user>/<label>, older
 * builds under /run/media/<label> (verify on device).
 */
export function sdCardRoots(): string[] {
  if (process.platform !== 'linux') return [];
  const base = '/run/media';
  if (!existsSync(base)) return [];
  const user = safeUser();
  const out: string[] = [];
  for (const name of safeReaddir(base)) {
    const p = join(base, name);
    if (!isDir(p)) continue;
    if (name === user || name === 'deck') {
      for (const child of safeReaddir(p)) if (isDir(join(p, child))) out.push(join(p, child));
    } else {
      out.push(p);
    }
  }
  return out;
}

function safeUser(): string {
  try {
    return userInfo().username;
  } catch {
    return '';
  }
}

function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** TOME_LIBRARY_DIRS (":"-separated) replaces the configured folders, for development. */
export function libraryOverride(): string[] | null {
  const v = process.env.TOME_LIBRARY_DIRS;
  return v ? v.split(':').filter(Boolean).map((p) => resolve(expandHome(p))) : null;
}
