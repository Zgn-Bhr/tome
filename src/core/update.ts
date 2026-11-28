// In-app updates from GitHub Releases: version comparison and release parsing.
// Pure, so the rules are unit-tested; the network and file work is in
// platform/updater.ts.

export const UPDATE_REPO = 'Zgn-Bhr/tome';
export const UPDATE_ASSET = 'Tome-x86_64.AppImage';
export const RELEASES_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
/** Automatic checks: at most this often (once a day, with some slack for launch times). */
export const CHECK_INTERVAL_MS = 20 * 60 * 60 * 1000;

export interface ReleaseInfo {
  /** "0.7.0", without the tag's "v". */
  version: string;
  /** The release title, e.g. "Tome v0.7.0 — Links". */
  title: string;
  url: string;
  size: number;
  /** Lower-case hex SHA-256 that GitHub publishes for the asset. */
  sha256: string;
}

/** "v0.10.2" → [0, 10, 2]; anything after "-" or "+" (pre-release, build) is ignored. */
export function versionParts(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0]!
    .split('.')
    .map((p) => (/^\d+$/.test(p) ? Number(p) : 0));
}

/** True if `latest` is a higher version than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Only files from this repo's release downloads are trusted. */
export function isTrustedAssetUrl(url: string): boolean {
  return url.startsWith(`https://github.com/${UPDATE_REPO}/releases/download/`);
}

/**
 * The AppImage from a GitHub "latest release" response, or null if the release
 * has no usable AppImage (missing, empty, or without a SHA-256 digest to check).
 */
export function parseRelease(json: unknown, opts: { trustAnyUrl?: boolean } = {}): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { tag_name?: unknown; name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || r.draft === true || r.prerelease === true || !Array.isArray(r.assets)) return null;
  const asset = (r.assets as { name?: unknown; size?: unknown; digest?: unknown; browser_download_url?: unknown }[]).find((a) => a?.name === UPDATE_ASSET);
  if (!asset || typeof asset.browser_download_url !== 'string' || typeof asset.size !== 'number' || asset.size <= 0) return null;
  const digest = typeof asset.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(asset.digest) : null;
  if (!digest) return null;
  if (!opts.trustAnyUrl && !isTrustedAssetUrl(asset.browser_download_url)) return null;
  const version = r.tag_name.replace(/^v/i, '');
  return {
    version,
    title: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Tome ${version}`,
    url: asset.browser_download_url,
    size: asset.size,
    sha256: digest[1]!.toLowerCase(),
  };
}

/** An automatic check is due if there has been none, or the last is old enough (or from the future). */
export function checkDue(lastCheckedAt: number | undefined, now: number): boolean {
  return lastCheckedAt === undefined || now - lastCheckedAt >= CHECK_INTERVAL_MS || lastCheckedAt > now;
}

/** "124 MB" for download sizes. */
export function formatMegabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}
