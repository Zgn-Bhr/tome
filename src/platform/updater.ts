// In-app updates for the AppImage, so nobody has to leave Game Mode to update.
//
// 1. Check: GET the latest release from the GitHub API (automatically at most
//    once a day when Settings → Check for updates is on, or when asked).
// 2. Download (only when the user picks Install): stream the AppImage into a
//    hidden file next to the running one, checking its size and the SHA-256
//    digest GitHub publishes for it.
// 3. Install: chmod 755 and rename over the running AppImage. The running app
//    keeps its old copy mounted, and the Steam shortcut (same path) starts the
//    new version from now on.
// 4. Restart (optional): /bin/sh waits for this process to exit, then starts
//    the AppImage again (verify in Game Mode on device). Electron's own
//    relaunch helper would run from the old AppImage mount, which goes away.

import { app, net } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chmod, rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { RELEASES_API, checkDue, isNewer, parseRelease, type ReleaseInfo } from '../core/update';
import type { UpdateState } from '../shared/api';

interface Stored {
  checkedAt?: number;
  /** The newest release seen, so "Update available" survives a restart without asking again. */
  latest?: ReleaseInfo;
}

const isDev = !app.isPackaged;
/** Development only: a local feed instead of GitHub (see docs in README → Scripts). */
const feedOverride = isDev ? process.env.TOME_UPDATE_URL : undefined;

export class Updater {
  private file: string;
  private stored: Stored = {};
  private state: UpdateState;
  private busy = false;
  private readonly current = app.getVersion();

  constructor(
    dataDir: string,
    private readonly send: (s: UpdateState) => void,
  ) {
    this.file = join(dataDir, 'update.json');
    try {
      this.stored = JSON.parse(readFileSync(this.file, 'utf8')) as Stored;
    } catch {
      this.stored = {};
    }
    const latest = this.stored.latest;
    if (!this.target()) this.state = { kind: 'unsupported' };
    else if (latest && isNewer(latest.version, this.current)) this.state = { kind: 'available', version: latest.version, title: latest.title, size: latest.size };
    else this.state = this.stored.checkedAt ? { kind: 'idle', checkedAt: this.stored.checkedAt } : { kind: 'idle' };
  }

  /** The AppImage being run (the AppImage runtime sets $APPIMAGE), if it can be replaced. */
  private target(): string | undefined {
    const p = process.env.APPIMAGE;
    if (!p || !existsSync(p)) return undefined;
    if (process.platform !== 'linux' && !feedOverride) return undefined;
    return p;
  }

  get(): UpdateState {
    return this.state;
  }

  private set(s: UpdateState): void {
    this.state = s;
    this.send(s);
  }

  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.stored));
    } catch {
      // Not critical: the next launch just checks again.
    }
  }

  /** Called on launch and every hour: checks if it's on and a day has passed. */
  autoCheck(enabled: boolean): void {
    if (!enabled || !this.target() || this.busy) return;
    if (this.state.kind !== 'idle' && this.state.kind !== 'current') return;
    if (!checkDue(this.stored.checkedAt, Date.now())) return;
    void this.check(false);
  }

  /** `manual`: asked for in Settings, so failures are shown; automatic ones fail quietly and retry later. */
  async check(manual: boolean): Promise<UpdateState> {
    if (!this.target()) return this.state;
    if (this.busy || this.state.kind === 'ready') return this.state;
    this.busy = true;
    const before = this.state;
    this.set({ kind: 'checking' });
    try {
      // no-store: GitHub allows 60 s of caching, which would make "check again" ask nobody.
      const res = await net.fetch(feedOverride ?? RELEASES_API, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Tome/${this.current}` },
      });
      if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub is busy; try again later' : `GitHub answered ${res.status}`);
      const info = parseRelease(await res.json(), { trustAnyUrl: !!feedOverride });
      if (!info) throw new Error("The latest release has no AppImage Tome can verify");
      const now = Date.now();
      this.stored = { checkedAt: now, ...(isNewer(info.version, this.current) ? { latest: info } : {}) };
      this.save();
      this.set(this.stored.latest ? { kind: 'available', version: info.version, title: info.title, size: info.size } : { kind: 'current', checkedAt: now });
    } catch (e) {
      // Offline is normal on a handheld: an automatic check just goes back to what we knew
      // (checkedAt isn't updated, so the hourly tick tries again).
      console.warn('[update] check failed:', e instanceof Error ? e.message : e);
      if (manual) this.set({ kind: 'error', message: messageOf(e) });
      else this.set(before);
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  async download(): Promise<void> {
    const target = this.target();
    const info = this.stored.latest;
    if (!target || !info || this.busy || !isNewer(info.version, this.current)) return;
    this.busy = true;
    const part = join(dirname(target), '.Tome-update.part');
    try {
      this.set({ kind: 'downloading', version: info.version, received: 0, size: info.size });
      // no-store: keep 130 MB out of Chromium's disk cache.
      const res = await net.fetch(info.url, { cache: 'no-store', headers: { 'User-Agent': `Tome/${this.current}` } });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      const out = createWriteStream(part, { mode: 0o644 });
      const hash = createHash('sha256');
      let received = 0;
      let lastSent = 0;
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          hash.update(chunk);
          received += chunk.length;
          if (received > info.size) throw new Error('The download is larger than expected');
          if (!out.write(chunk)) await once(out, 'drain');
          const now = Date.now();
          if (now - lastSent > 250) {
            lastSent = now;
            this.set({ kind: 'downloading', version: info.version, received, size: info.size });
          }
        }
      } finally {
        out.end();
        await once(out, 'close');
      }
      if (received !== info.size) throw new Error('The download was cut short');
      if (hash.digest('hex') !== info.sha256) throw new Error("The download doesn't match the published checksum");
      await chmod(part, 0o755);
      // Same folder, so the rename is atomic: the old file stays intact until this succeeds.
      await rename(part, target);
      this.set({ kind: 'ready', version: info.version });
    } catch (e) {
      console.warn('[update] download failed:', e instanceof Error ? e.message : e);
      await rm(part, { force: true });
      this.set({ kind: 'error', message: messageOf(e), version: info.version });
    } finally {
      this.busy = false;
    }
  }

  /** Quit and start the (now replaced) AppImage once this process has exited. */
  restart(): void {
    const target = this.target();
    if (!target || this.state.kind !== 'ready') return;
    const env = { ...process.env };
    const appDir = env.APPDIR;
    // Drop what points into the old AppImage mount; the new runtime sets them again.
    for (const k of ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k];
    if (appDir && env.LD_LIBRARY_PATH) {
      const kept = env.LD_LIBRARY_PATH.split(':').filter((p) => p && !p.startsWith(appDir));
      if (kept.length) env.LD_LIBRARY_PATH = kept.join(':');
      else delete env.LD_LIBRARY_PATH;
    }
    const wait = 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; shift; exec "$@"';
    spawn('/bin/sh', ['-c', wait, 'sh', String(process.pid), target, ...process.argv.slice(1)], { detached: true, stdio: 'ignore', env }).unref();
    app.quit();
  }
}

function messageOf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/EACCES|EPERM|EROFS/.test(m)) return "Can't write next to the AppImage";
  if (/ENOSPC/.test(m)) return 'Not enough free space';
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_ACCESS_DENIED/.test(m)) return 'No internet connection';
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_FAILED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|Failed to fetch/.test(m)) return "Couldn't reach GitHub";
  if (/net::ERR_/.test(m)) return 'The connection dropped';
  return m.length > 120 ? `${m.slice(0, 117)}…` : m;
}
