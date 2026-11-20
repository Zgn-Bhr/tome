// Folder scan and BookId hashing (spec §4, §11 "Rescan on launch").

import { createHash } from 'node:crypto';
import { open, opendir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { Settings } from '../core/models';
import { prettifyFilename } from '../core/library';
import type { DirListing } from '../shared/api';
import type { FileRow, TomeDb } from './db';
import { expandHome, libraryOverride, sdCardRoots } from './paths';

const MAX_DEPTH = 8;
const MAX_FILES = 20_000;
const HASH_BYTES = 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'Library', 'AppData', 'steamapps', 'compatdata', 'shadercache']);

/** sha1 of (file size + first 1 MiB): survives renames and moves. */
export async function bookIdFor(path: string, size: number): Promise<string> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(Math.min(size, HASH_BYTES));
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return createHash('sha1').update(`${size}\n`).update(buf.subarray(0, bytesRead)).digest('hex');
  } finally {
    await fh.close();
  }
}

export function libraryRoots(settings: Settings): string[] {
  const override = libraryOverride();
  if (override) return override;
  const roots = settings.folders.map(expandHome);
  if (settings.includeSdCards) roots.push(...sdCardRoots());
  return [...new Set(roots)];
}

async function walk(root: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let dir;
  try {
    dir = await opendir(root);
  } catch {
    return; // missing or unreadable folder
  }
  for await (const ent of dir) {
    if (ent.name.startsWith('.')) continue;
    const p = join(root, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) await walk(p, depth + 1, out);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) {
      out.push(p);
      if (out.length >= MAX_FILES) return;
    }
  }
}

/** Scan every library root and reconcile with the database. */
export async function scanLibrary(db: TomeDb, settings: Settings): Promise<void> {
  const files: string[] = [];
  for (const root of libraryRoots(settings)) await walk(root, 0, files);

  const known: Map<string, FileRow> = db.fileIndex();
  const byId = new Map<string, { id: string; path: string; size: number; mtime: number; title: string; addedAt: number }>();
  const now = Date.now();

  for (const path of files) {
    let st;
    try {
      st = await stat(path);
    } catch {
      continue;
    }
    if (st.size === 0) continue;
    const size = st.size;
    const mtime = Math.round(st.mtimeMs);
    const prev = known.get(path);
    let id: string;
    if (prev && prev.size === size && prev.mtime === mtime) id = prev.id;
    else {
      try {
        id = await bookIdFor(path, size);
      } catch {
        continue;
      }
    }
    const entry = {
      id,
      path,
      size,
      mtime,
      title: prettifyFilename(path),
      addedAt: Math.min(now, Math.round(st.birthtimeMs || st.mtimeMs) || now),
    };
    // Duplicates (same hash): one book, newest path wins.
    const dup = byId.get(id);
    if (!dup || mtime > dup.mtime) byId.set(id, entry);
  }
  db.applyScan([...byId.values()]);
}

/** In-app folder picker listing (the system dialog is unusable in Game Mode). */
export async function listDir(path: string | undefined): Promise<DirListing> {
  const home = homedir();
  const roots = [
    { label: 'Home', path: home },
    { label: 'Documents', path: join(home, 'Documents') },
    { label: 'Downloads', path: join(home, 'Downloads') },
    ...sdCardRoots().map((p) => ({ label: `SD card · ${basename(p)}`, path: p })),
  ];
  const target = path ? expandHome(path) : home;
  const listing: DirListing = { path: target, dirs: [], pdfCount: 0, roots };
  const parent = dirname(target);
  if (parent !== target) listing.parent = parent;
  try {
    const dir = await opendir(target);
    for await (const ent of dir) {
      if (ent.name.startsWith('.')) continue;
      if (ent.isDirectory()) listing.dirs.push({ name: ent.name, path: join(target, ent.name) });
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) listing.pdfCount++;
    }
    listing.dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } catch (e) {
    listing.error = e instanceof Error ? e.message : String(e);
  }
  return listing;
}
