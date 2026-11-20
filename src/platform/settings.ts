// settings.json in the data folder, written atomically.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Settings } from '../core/models';
import { withDefaults } from '../core/settings';

export class SettingsStore {
  private file: string;
  private current: Settings;
  /** True once the file exists (the user has been through first run). */
  saved: boolean;

  constructor(dir: string) {
    this.file = join(dir, 'settings.json');
    this.saved = existsSync(this.file);
    let parsed: Partial<Settings> | undefined;
    if (this.saved) {
      try {
        parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Settings>;
      } catch {
        parsed = undefined; // corrupt file: fall back to defaults
      }
    }
    this.current = withDefaults(parsed);
  }

  get(): Settings {
    return this.current;
  }

  set(patch: Partial<Settings>): Settings {
    this.current = withDefaults({ ...this.current, ...patch });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.current, null, 2));
    renameSync(tmp, this.file);
    this.saved = true;
    return this.current;
  }
}
