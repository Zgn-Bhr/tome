// Steam library artwork for Tome's non-Steam shortcut (spec M6).
//
// Steam keeps custom library art as plain files in
// <Steam>/userdata/<user>/config/grid/, named after the shortcut's 32-bit ID:
//   <id>p.png      capsule (portrait, the library grid)
//   <id>.png       wide capsule (landscape tiles, e.g. recent games)
//   <id>_hero.png  hero (the banner on the game page)
//   <id>_logo.png  logo (drawn over the hero, bottom left by default)
// The ID comes from Steam's shortcut list, <user>/config/shortcuts.vdf, a
// binary KeyValues file. Pure, so the rules are unit-tested; the file work is
// in platform/steamArt.ts.

export interface SteamShortcut {
  /** Unsigned 32-bit shortcut ID, as used in grid file names; null if the entry has none. */
  appid: number | null;
  name: string;
  /** The executable as Steam stores it (usually in double quotes). */
  exe: string;
}

type VdfValue = string | number | bigint | VdfMap;
export interface VdfMap {
  [key: string]: VdfValue;
}

const T_MAP = 0x00;
const T_STRING = 0x01;
const T_INT32 = 0x02;
const T_FLOAT = 0x03;
const T_POINTER = 0x04;
const T_COLOR = 0x06;
const T_UINT64 = 0x07;
const T_END = 0x08;
const T_INT64 = 0x0a;
const MAX_DEPTH = 16;

/** Parses Steam's binary KeyValues format (shortcuts.vdf). Throws on damaged or unknown data. */
export function parseBinaryVdf(bytes: Uint8Array): VdfMap {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let pos = 0;

  const need = (n: number) => {
    if (pos + n > bytes.length) throw new Error('shortcuts.vdf: unexpected end of file');
  };
  const cstring = (): string => {
    const end = bytes.indexOf(0, pos);
    if (end < 0) throw new Error('shortcuts.vdf: unterminated string');
    const s = decoder.decode(bytes.subarray(pos, end));
    pos = end + 1;
    return s;
  };
  const map = (depth: number): VdfMap => {
    if (depth > MAX_DEPTH) throw new Error('shortcuts.vdf: nested too deeply');
    const out: VdfMap = {};
    for (;;) {
      // The outermost map may end at the end of the file instead of an end marker.
      if (depth === 0 && pos >= bytes.length) return out;
      need(1);
      const type = bytes[pos++]!;
      if (type === T_END) return out;
      const key = cstring();
      switch (type) {
        case T_MAP:
          out[key] = map(depth + 1);
          break;
        case T_STRING:
          out[key] = cstring();
          break;
        case T_INT32:
        case T_POINTER:
        case T_COLOR:
          need(4);
          out[key] = view.getInt32(pos, true);
          pos += 4;
          break;
        case T_FLOAT:
          need(4);
          out[key] = view.getFloat32(pos, true);
          pos += 4;
          break;
        case T_UINT64:
          need(8);
          out[key] = view.getBigUint64(pos, true);
          pos += 8;
          break;
        case T_INT64:
          need(8);
          out[key] = view.getBigInt64(pos, true);
          pos += 8;
          break;
        default:
          throw new Error(`shortcuts.vdf: unknown value type ${type}`);
      }
    }
  };
  return map(0);
}

/** Steam isn't consistent about key case ("Exe" vs "exe", "AppName" vs "appname"). */
function field(m: VdfMap, key: string): VdfValue | undefined {
  const k = key.toLowerCase();
  for (const [name, value] of Object.entries(m)) if (name.toLowerCase() === k) return value;
  return undefined;
}

const isMap = (v: VdfValue | undefined): v is VdfMap => typeof v === 'object' && v !== null && typeof v !== 'bigint';

/** The shortcuts in a shortcuts.vdf file. */
export function parseShortcuts(bytes: Uint8Array): SteamShortcut[] {
  const list = field(parseBinaryVdf(bytes), 'shortcuts');
  if (!isMap(list)) return [];
  const out: SteamShortcut[] = [];
  for (const entry of Object.values(list)) {
    if (!isMap(entry)) continue;
    const id = field(entry, 'appid');
    const name = field(entry, 'AppName');
    const exe = field(entry, 'Exe');
    out.push({
      // Stored as a signed int32; grid file names use the unsigned value.
      appid: typeof id === 'number' && Number.isInteger(id) && id !== 0 ? id >>> 0 : null,
      name: typeof name === 'string' ? name : '',
      exe: typeof exe === 'string' ? exe : '',
    });
  }
  return out;
}

/** '"/home/deck/Applications/Tome.AppImage"' → '/home/deck/Applications/Tome.AppImage'. */
export function unquote(exe: string): string {
  const s = exe.trim();
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

export type ArtSlot = 'capsule' | 'wide' | 'hero' | 'logo';

/** Each slot: the bundled file (resources/steam) and the grid file name without extension. */
export const ART_SLOTS: readonly { slot: ArtSlot; source: string; base: (id: number) => string }[] = [
  { slot: 'capsule', source: 'capsule.png', base: (id) => `${id}p` },
  { slot: 'wide', source: 'wide.png', base: (id) => `${id}` },
  { slot: 'hero', source: 'hero.png', base: (id) => `${id}_hero` },
  { slot: 'logo', source: 'logo.png', base: (id) => `${id}_logo` },
];

export interface ArtCopy {
  slot: ArtSlot;
  /** File name in resources/steam. */
  source: string;
  /** File name in the grid folder. */
  target: string;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

/**
 * Which bundled images to copy into a grid folder that already holds `existing`
 * (file names). A slot that has any image, such as art the user picked
 * themselves or got from SteamGridDB, is left alone.
 */
export function planArt(appid: number, existing: readonly string[]): ArtCopy[] {
  const taken = new Set(existing.filter((f) => IMAGE_EXT.test(f)).map((f) => f.replace(IMAGE_EXT, '')));
  return ART_SLOTS.filter((s) => !taken.has(s.base(appid))).map((s) => ({ slot: s.slot, source: s.source, target: `${s.base(appid)}.png` }));
}
