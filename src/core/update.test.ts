import { describe, expect, it } from 'vitest';
import { CHECK_INTERVAL_MS, checkDue, formatMegabytes, isNewer, parseRelease, versionParts } from './update';

const DIGEST = 'sha256:d39de146815bc4dfba15ba89ba33541dd3ca3984db4880819e99cd96e9fbf16d';
const release = (over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}) => ({
  tag_name: 'v0.7.0',
  name: 'Tome v0.7.0 — Links',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'Tome-x86_64.AppImage.blockmap', size: 10, browser_download_url: 'https://github.com/Zgn-Bhr/tome/releases/download/v0.7.0/x.blockmap' },
    {
      name: 'Tome-x86_64.AppImage',
      size: 130_140_259,
      digest: DIGEST,
      browser_download_url: 'https://github.com/Zgn-Bhr/tome/releases/download/v0.7.0/Tome-x86_64.AppImage',
      ...asset,
    },
  ],
  ...over,
});

describe('updates', () => {
  it('compares versions numerically', () => {
    expect(versionParts('v0.10.2')).toEqual([0, 10, 2]);
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('0.7.0', '0.6.0')).toBe(true);
    expect(isNewer('v0.6.0', '0.6.0')).toBe(false);
    expect(isNewer('0.6.0', '0.6.1')).toBe(false);
    expect(isNewer('1.0', '0.99.99')).toBe(true);
    expect(isNewer('0.7.0-beta.1', '0.7.0')).toBe(false);
  });

  it('reads the AppImage from a GitHub release', () => {
    expect(parseRelease(release())).toEqual({
      version: '0.7.0',
      title: 'Tome v0.7.0 — Links',
      url: 'https://github.com/Zgn-Bhr/tome/releases/download/v0.7.0/Tome-x86_64.AppImage',
      size: 130_140_259,
      sha256: DIGEST.slice(7),
    });
    expect(parseRelease(release({ name: '' }))?.title).toBe('Tome 0.7.0');
  });

  it('refuses releases it cannot verify or should not install', () => {
    expect(parseRelease(release({}, { digest: undefined }))).toBeNull();
    expect(parseRelease(release({}, { digest: 'md5:abc' }))).toBeNull();
    expect(parseRelease(release({}, { size: 0 }))).toBeNull();
    expect(parseRelease(release({}, { browser_download_url: 'https://evil.example/Tome-x86_64.AppImage' }))).toBeNull();
    expect(parseRelease(release({ prerelease: true }))).toBeNull();
    expect(parseRelease(release({ assets: [] }))).toBeNull();
    expect(parseRelease({ message: 'API rate limit exceeded' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
    // A local test feed (development only) may point anywhere.
    expect(parseRelease(release({}, { browser_download_url: 'http://127.0.0.1:8766/Tome-x86_64.AppImage' }), { trustAnyUrl: true })?.url).toBe(
      'http://127.0.0.1:8766/Tome-x86_64.AppImage',
    );
  });

  it('checks at most about once a day', () => {
    const now = 1_000_000_000_000;
    expect(checkDue(undefined, now)).toBe(true);
    expect(checkDue(now - 60_000, now)).toBe(false);
    expect(checkDue(now - CHECK_INTERVAL_MS, now)).toBe(true);
    expect(checkDue(now + 60_000, now)).toBe(true); // clock went backwards
  });

  it('formats download sizes', () => {
    expect(formatMegabytes(130_140_259)).toBe('130 MB');
    expect(formatMegabytes(10)).toBe('1 MB');
  });
});
