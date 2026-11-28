// Game manuals downloaded by ES-DE (EmulationStation Desktop Edition).
//
// ES-DE's scraper saves them as <media dir>/<system>/manuals/<rom name>.pdf.
// The media dir is called "downloaded_media" in every common setup: ES-DE's
// default (~/ES-DE/downloaded_media), EmuDeck (Emulation/tools/downloaded_media,
// on the SD card or in home) and RetroDECK (~/retrodeck/downloaded_media).
// Manuals are recognised from that path alone, so nothing here touches the disk.

export const MEDIA_DIR = 'downloaded_media';
export const MANUALS_DIR = 'manuals';

/** Where ES-DE keeps downloaded media when it isn't under a scanned folder. */
export const ESDE_MEDIA_DIRS = ['~/ES-DE/downloaded_media', '~/Emulation/tools/downloaded_media', '~/retrodeck/downloaded_media'];

export interface GameManual {
  /** ES-DE's short system name, lower case: "snes", "psx", "megadrive"… */
  system: string;
}

/** The ES-DE system a PDF is a manual for, or undefined if it isn't one. */
export function gameManual(path: string): GameManual | undefined {
  const parts = path.split(/[\\/]+/);
  // The file sits at <MEDIA_DIR>/<system>/manuals/…/<file>.pdf (subfolders mirror the ROM folders).
  for (let i = parts.length - 4; i >= 0; i--) {
    if (parts[i]!.toLowerCase() === MEDIA_DIR && parts[i + 2]!.toLowerCase() === MANUALS_DIR && parts[i + 1]) {
      return { system: parts[i + 1]!.toLowerCase() };
    }
  }
  return undefined;
}

/** Inside <MEDIA_DIR>/<system>/ only the manuals folder can hold manuals (the rest is images and videos). */
export function isMediaSystemDir(dirPath: string): boolean {
  const parts = dirPath.split(/[\\/]+/).filter(Boolean);
  return parts.length >= 2 && parts[parts.length - 2]!.toLowerCase() === MEDIA_DIR;
}

/**
 * A readable title from the ROM file name ES-DE gives the manual:
 * "Legend of Zelda, The - A Link to the Past (USA) [!].pdf" → "The Legend of Zelda - A Link to the Past".
 */
export function manualTitle(path: string): string {
  const base = (path.split(/[\\/]/).pop() ?? path).replace(/\.pdf$/i, '').replace(/_+/g, ' ');
  const untagged = base.replace(/\s*(\([^()]*\)|\[[^[\]]*\])/g, '').replace(/\s+/g, ' ').trim();
  const name = untagged || base.trim();
  // No-Intro style moves leading articles to the end: "Legend of Zelda, The".
  const m = /^(.+?), (The|A|An)((?: - |: ).*)?$/.exec(name);
  return m ? `${m[2]} ${m[1]}${m[3] ?? ''}` : name;
}

/** ES-DE system names (as in its es_systems.xml) for the systems people scrape most. */
const SYSTEM_NAMES: Record<string, string> = {
  '3do': '3DO',
  '3ds': 'Nintendo 3DS',
  n3ds: 'Nintendo 3DS',
  amiga: 'Commodore Amiga',
  amstradcpc: 'Amstrad CPC',
  arcade: 'Arcade',
  atari2600: 'Atari 2600',
  atari5200: 'Atari 5200',
  atari7800: 'Atari 7800',
  atarijaguar: 'Atari Jaguar',
  atarilynx: 'Atari Lynx',
  atarist: 'Atari ST',
  c64: 'Commodore 64',
  colecovision: 'ColecoVision',
  dos: 'DOS',
  dreamcast: 'Sega Dreamcast',
  famicom: 'Famicom',
  fbneo: 'FinalBurn Neo',
  fds: 'Famicom Disk System',
  gamegear: 'Sega Game Gear',
  gb: 'Game Boy',
  gba: 'Game Boy Advance',
  gbc: 'Game Boy Color',
  gc: 'Nintendo GameCube',
  gamecube: 'Nintendo GameCube',
  genesis: 'Sega Genesis',
  intellivision: 'Intellivision',
  mame: 'MAME',
  mastersystem: 'Sega Master System',
  megacd: 'Sega Mega-CD',
  megadrive: 'Sega Mega Drive',
  msx: 'MSX',
  n64: 'Nintendo 64',
  nds: 'Nintendo DS',
  neogeo: 'Neo Geo',
  neogeocd: 'Neo Geo CD',
  nes: 'Nintendo Entertainment System',
  ngp: 'Neo Geo Pocket',
  ngpc: 'Neo Geo Pocket Color',
  pc: 'PC',
  pcengine: 'PC Engine',
  pcenginecd: 'PC Engine CD',
  ps2: 'PlayStation 2',
  ps3: 'PlayStation 3',
  ps4: 'PlayStation 4',
  psp: 'PlayStation Portable',
  psvita: 'PlayStation Vita',
  psx: 'PlayStation',
  saturn: 'Sega Saturn',
  scummvm: 'ScummVM',
  sega32x: 'Sega 32X',
  segacd: 'Sega CD',
  sfc: 'Super Famicom',
  sg1000: 'Sega SG-1000',
  snes: 'Super Nintendo',
  snesna: 'Super Nintendo',
  switch: 'Nintendo Switch',
  tg16: 'TurboGrafx-16',
  tgcd: 'TurboGrafx-CD',
  vectrex: 'Vectrex',
  virtualboy: 'Virtual Boy',
  wii: 'Nintendo Wii',
  wiiu: 'Nintendo Wii U',
  wonderswan: 'WonderSwan',
  wonderswancolor: 'WonderSwan Color',
  xbox: 'Xbox',
  xbox360: 'Xbox 360',
  zxspectrum: 'ZX Spectrum',
};

/** "snes" → "Super Nintendo"; unknown systems show their folder name in capitals. */
export function systemName(system: string): string {
  return SYSTEM_NAMES[system.toLowerCase()] ?? system.toUpperCase();
}
