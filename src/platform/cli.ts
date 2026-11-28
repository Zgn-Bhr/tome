// Command-line jobs for the install script. They run without a window and exit:
//   Tome.AppImage --steam-art [--wait SECONDS]   put the artwork on Tome's Steam shortcut
//   Tome.AppImage --export-icon PATH             save the app icon (for the menu entry)
// Progress details go to stderr; the one-line result goes to stdout.

import { resolve } from 'node:path';
import { dataDir } from './paths';
import { appImagePath, applySteamArt, exportIcon } from './steamArt';

const MAX_WAIT_SEC = 120;

function valueAfter(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
}

/** The job these arguments ask for, or null to start the app as usual. */
export function cliJob(argv: string[]): (() => Promise<number>) | null {
  if (argv.includes('--export-icon')) {
    const dest = valueAfter(argv, '--export-icon');
    return async () => {
      if (!dest) {
        console.error('--export-icon needs a file path');
        return 2;
      }
      await exportIcon(resolve(dest));
      console.log(`Saved Tome's icon to ${resolve(dest)}`);
      return 0;
    };
  }
  if (argv.includes('--steam-art')) {
    const wait = Number(valueAfter(argv, '--wait') ?? 0);
    return async () => {
      const exe = appImagePath();
      if (!exe) {
        console.error('--steam-art only works from the Tome AppImage');
        return 2;
      }
      const r = await applySteamArt({
        dataDir: dataDir(),
        exe,
        waitSec: Number.isFinite(wait) ? Math.min(Math.max(wait, 0), MAX_WAIT_SEC) : 0,
        log: (m) => console.error(m),
      });
      if (!r.shortcuts) {
        console.log("Tome isn't in Steam's library yet, so its artwork wasn't added. Tome adds it itself the next time it starts.");
        return 1;
      }
      console.log(
        r.added
          ? `Added Tome's artwork to Steam (${r.added} images). It appears the next time Steam starts, e.g. when you switch to Game Mode.`
          : "Tome's Steam artwork is already in place.",
      );
      return 0;
    };
  }
  return null;
}
