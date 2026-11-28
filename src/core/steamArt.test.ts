import { describe, expect, it } from 'vitest';
import { parseBinaryVdf, parseShortcuts, planArt, unquote } from './steamArt';

// A tiny writer for Steam's binary KeyValues, enough to build test files.
type Value = string | number | { [k: string]: Value };
const enc = new TextEncoder();
function cstr(s: string): number[] {
  return [...enc.encode(s), 0];
}
function kv(m: { [k: string]: Value }): number[] {
  const out: number[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'string') out.push(0x01, ...cstr(k), ...cstr(v));
    else if (typeof v === 'number') {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setInt32(0, v, true);
      out.push(0x02, ...cstr(k), ...b);
    } else out.push(0x00, ...cstr(k), ...kv(v), 0x08);
  }
  return out;
}
const vdf = (m: { [k: string]: Value }) => new Uint8Array([...kv(m), 0x08]);

const tome = {
  appid: -1234567890,
  AppName: 'Tome',
  Exe: '"/home/deck/Applications/Tome.AppImage"',
  StartDir: '"/home/deck/Applications/"',
  icon: '',
  LaunchOptions: '',
  IsHidden: 0,
  LastPlayTime: 1764300000,
  tags: { '0': 'Reading' },
};

describe('Steam shortcuts', () => {
  it('reads the shortcut list, with unsigned IDs', () => {
    const list = parseShortcuts(vdf({ shortcuts: { '0': { appid: 1000, appname: 'Game', exe: 'game.sh' }, '1': tome } }));
    expect(list).toEqual([
      { appid: 1000, name: 'Game', exe: 'game.sh' },
      { appid: 3060399406, name: 'Tome', exe: '"/home/deck/Applications/Tome.AppImage"' },
    ]);
  });

  it('handles an empty list, a missing end marker and entries without an ID', () => {
    expect(parseShortcuts(vdf({ shortcuts: {} }))).toEqual([]);
    expect(parseShortcuts(new Uint8Array(kv({ shortcuts: { '0': { AppName: 'Old', Exe: 'x' } } })))).toEqual([{ appid: null, name: 'Old', exe: 'x' }]);
  });

  it('reads 64-bit and float values without losing its place', () => {
    const b = [0x00, ...cstr('shortcuts'), 0x00, ...cstr('0')];
    b.push(0x07, ...cstr('big'), 1, 2, 3, 4, 5, 6, 7, 8);
    b.push(0x03, ...cstr('f'), 0, 0, 0x80, 0x3f);
    b.push(0x01, ...cstr('AppName'), ...cstr('Tome'), 0x08, 0x08, 0x08);
    const root = parseBinaryVdf(new Uint8Array(b));
    expect(root).toEqual({ shortcuts: { '0': { big: 0x0807060504030201n, f: 1, AppName: 'Tome' } } });
  });

  it('rejects damaged files', () => {
    const good = vdf({ shortcuts: { '0': tome } });
    expect(() => parseShortcuts(good.subarray(0, good.length - 20))).toThrow();
    expect(() => parseShortcuts(new Uint8Array([0x00, ...cstr('shortcuts'), 0x09, ...cstr('x')]))).toThrow(/unknown value type/);
  });

  it('strips the quotes Steam puts around paths', () => {
    expect(unquote('"/home/deck/Applications/Tome.AppImage"')).toBe('/home/deck/Applications/Tome.AppImage');
    expect(unquote(' /usr/bin/tome ')).toBe('/usr/bin/tome');
  });
});

describe('artwork plan', () => {
  it('fills every empty slot', () => {
    expect(planArt(42, [])).toEqual([
      { slot: 'capsule', source: 'capsule.png', target: '42p.png' },
      { slot: 'wide', source: 'wide.png', target: '42.png' },
      { slot: 'hero', source: 'hero.png', target: '42_hero.png' },
      { slot: 'logo', source: 'logo.png', target: '42_logo.png' },
    ]);
  });

  it('never replaces art that is already there, whatever its format', () => {
    const plan = planArt(42, ['42p.jpg', '42_hero.PNG', '7_logo.png', '42.json', '42_logo.txt']);
    expect(plan.map((c) => c.target)).toEqual(['42.png', '42_logo.png']);
  });
});
