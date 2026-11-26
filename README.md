# Tome

A controller-first PDF reader for Steam Deck Game Mode, with a light game layer (stages, XP, streaks, trophies) around reading. The design source and the full spec live in [tome-design-source/](tome-design-source/); [tome-design-spec.md](tome-design-source/tome-design-spec.md) is the source of truth for behaviour.

Stack: **Electron 45 + React 19 + TypeScript + pdf.js 6**, built with electron-vite. This follows the spec's default runtime (§3.1, option A).

## Status

| Milestone (spec §15) | State |
|---|---|
| **M0 Shell**: fullscreen and docked scaling, tokens, glyphs, prompt bar, buttons, gamepad input with keyboard fallback, focus engine, debug overlay | Done |
| **M1 Reader core**: fit width/page, page turns, scrolling with an edge bump, analog trigger zoom, right-stick and trackpad pan, HUD, Paper/Sepia/Night/Dim themes, position persistence, suspend handling | Done |
| **M2 Library**: folder scan, SQLite, cover thumbnails, Home, Library grid with filters and sort, Book details, first-run folder picker | Done |
| **M3 Stages and game layer**: stage derivation, stage map (Book details and reader Y), page counting by dwell and coverage, XP ledger, levels, daily quest, streak, stage and book clears, trophies, toasts, Session complete, Full/Light/Off intensity | Done (the alternative "XP per minute" model is not built) |
| M4 Papers (auto-crop, column mode, heading stages) | Not started (the paper heuristic and kind badge already work) |
| M5 Tate mode, full Settings, Search, Collections, Trophies tab, links | Not started (a first Settings overlay exists) |
| M6 Ship on Deck: AppImage, install notes, Steam Input layout, artwork | Build script and docs written; on-device QA still to do |

## Run it on your Mac

```bash
npm install
```

Generate the test PDFs (all text is generated, so there's no third-party content):

```bash
npm run fixtures
```

Run against the fixtures, with data in `./.tome-dev` so your real library isn't touched:

```bash
npm run dev:fixtures
```

Or run against your real folders (`~/Documents`, `~/Downloads`). macOS will ask Electron for folder access:

```bash
npm run dev
```

Any Xbox-style controller works over USB or Bluetooth. Without one, use the keyboard (spec §6.5):

| Key | Deck control | Key | Deck control |
|---|---|---|---|
| Arrows | D-pad | Q / E | L1 / R1 |
| Enter | A | Z / C (hold) | L2 / R2 (zoom in the reader) |
| Esc / Backspace | B | Tab | View |
| X / Y | X / Y | M | Menu |
| Page Up / Page Down | L4 / R4 | `[` / `]` | L5 / R5 |

The mouse wheel scrolls (like the left trackpad), dragging pans (like the right trackpad), and Ctrl+wheel or a pinch zooms. **Ctrl+Shift+D** toggles the debug overlay with connected gamepads.

## Install on a Steam Deck

In Desktop Mode, open Konsole and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Zgn-Bhr/tome/main/scripts/install-deck.sh | bash
```

This installs the latest release to `~/Applications/Tome.AppImage` and adds it to Steam. Run it again to update. Details, manual steps and troubleshooting are in [docs/steam-deck-install.md](docs/steam-deck-install.md); back-grip and trackpad bindings are in [docs/steam-input-layout.md](docs/steam-input-layout.md).

## Build for Steam Deck

```bash
npm run dist:linux
```

This produces `dist/Tome-x86_64.AppImage`. To publish it as a release (the install script downloads from the latest release):

```bash
gh release create v0.1.0 dist/Tome-x86_64.AppImage --title "Tome v0.1.0" --notes "…"
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `dev:fixtures` | Dev mode with hot reload |
| `npm test` | Unit tests for `src/core` (vitest) |
| `npm run typecheck` | TypeScript for main and renderer |
| `npm run build` | Production bundle in `out/` |
| `npm start` | Run the production bundle |
| `npm run fixtures` | Regenerate `fixtures/pdfs/*.pdf` |
| `npm run dist:linux` | Steam Deck AppImage |

**Smoke driver (dev only):** `TOME_SMOKE=steps.json electron .` runs scripted key presses and saves screenshots of the real window. See [src/platform/smoke.ts](src/platform/smoke.ts) for the format. Other environment variables: `TOME_DATA_DIR` (storage root), `TOME_LIBRARY_DIRS` (`:`-separated folders that replace the configured ones) and `TOME_OPEN_DEVTOOLS`.

## Layout

```
src/
  core/       pure TS, no DOM/Node: models, input engine + focus graphs, viewport math,
              stage derivation, game rules, library filters. Unit-tested.
  pdf/        pdf.js wrapper: open, outline, text sampling, covers, LRU page renderer, themes
  platform/   Electron main: window, tome:// protocol (range requests), SQLite, folder scan, IPC
  shared/     the typed IPC contract (api.ts)
  ui/         React: tokens, components, screens, input loop, focus hook
scripts/      fixture generator, pdf.js asset copy
```

## Where this differs from the spec (flagged per §0)

- **SQLite via `node:sqlite`, not `better-sqlite3`.** Electron 45 ships Node 24, whose built-in SQLite works in WAL mode. With no native module to compile, the Linux AppImage builds straight from a Mac.
- **Progress means counted pages.** Gold bars and percentages (covers, Home, Book details) show the share of pages *counted* by the dwell and coverage rule, because gold means earned. Where you are in the book shows as "p. X / N" and as the cyan knob in the HUD. A page you jump to still has to be read to count.
- **Counting details:** coverage is measured on a 24×24 grid of the page, so zoom and panning count. Dwell builds up in 1-second steps and pauses while an overlay (stage map, Display menu) covers the page. Coverage from an earlier session carries over as a single fraction.
- **Toasts:** several trophies unlocked at the same moment share one toast; pending toasts are dropped when Session complete opens (it lists them all); toasts sit below the HUD's top bar while the HUD is open.
- **Home "Read again":** when every book is opened and the Continue card would show a cleared book, it says "Cleared · Read again" instead of "Start reading".
- **Reader D-pad ←/→:** the spec's table reads "D-pad ← / → · Next / previous page". I mapped ← to previous and → to next; the literal order looks like a typo.
- **B with the HUD open saves and leaves** (the HUD's own "B Library" prompt). §7.5 says the HUD "stays open until A or B", which this also satisfies.
- **Front matter:** if the first outline entry starts 3 or more pages in, those pages become a "Front matter" stage; a shorter gap joins stage 1.
- **Short numerals:** when most stages are numbered, unnumbered ones get a short numeral ("Intro", "Pref", "Epil") so the map doesn't mix "1" with "I, II".
- **Settings:** a first overlay with the settings that already work (folders, rescan, theme, fit, gutters, transition, Zen, game layer, daily goal, haptics, reduce motion, debug). Back-grip keys are shown but not yet editable.
- **Search, Collections and Trophies** aren't built yet: Y shows a "later build" toast, and the two tabs show a placeholder.

## Open decisions (spec §16)

These still use the spec's defaults: the runtime (standalone Electron), the XP model (word-weighted pages), Full game intensity, Dim offered for figure-heavy PDFs, the Steam Input layout documented rather than shipped, and the name "Tome".
