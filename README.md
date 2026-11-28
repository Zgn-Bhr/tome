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
| **M4 Papers**: auto-crop margins, two-column detection (text layer or ink for scans), Column mode, heading-based stages, the paper heuristic and Library callout | Done |
| M5 Tate mode, full Settings, Search, Collections, Trophies tab, links | Partly done: **Collections**, the **in-app keyboard**, **Search** and the **Trophies tab** are built, and a first Settings overlay exists. Tate mode, full Settings and links are not started. |
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

**Download page: https://zgn-bhr.github.io/tome/** has a Download button and point-and-click steps.

Or, in Desktop Mode, open Konsole and run:

```bash
curl -sL https://zgn-bhr.github.io/tome/install | bash
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

The download page lives in `site/` and is published by `.github/workflows/pages.yml` on every push that changes it or the install script.

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
- **Auto-crop** applies to Width and Column fit. Fit page shows the whole page, as §8.3 says ("the whole page fits"), so slides keep their full design.
- **Column mode details:** column segments are trimmed to where column text actually is, and bands separated only by white space merge into one. The left and right columns share one scale, so moving between them doesn't zoom. Moving to the next segment slides in over 200 ms (sideways between columns, vertically otherwise). Coverage for page counting is measured against the cropped content box.
- **Scans:** ink analysis (Otsu threshold, projection profile) runs on a 300 px render. Per page, it's only done for books detected as two-column.
- **Re-analysis on upgrade:** books indexed by an older version are re-analysed in the background. Their stages are kept when they come from an outline or any stage is already cleared, because clears are tied to stage numbers; otherwise heading stages may replace an even split.
- **Heading stages** follow the one-page merge rule (§13): a one-page "Abstract" stage merges into the next stage.
- **Toasts:** several trophies unlocked at the same moment share one toast; pending toasts are dropped when Session complete opens (it lists them all); toasts sit below the HUD's top bar while the HUD is open.
- **Home "Read again":** when every book is opened and the Continue card would show a cleared book, it says "Cleared · Read again" instead of "Start reading".
- **Reader D-pad ←/→:** the spec's table reads "D-pad ← / → · Next / previous page". I mapped ← to previous and → to next; the literal order looks like a typo.
- **B with the HUD open saves and leaves** (the HUD's own "B Library" prompt). §7.5 says the HUD "stays open until A or B", which this also satisfies.
- **Front matter:** if the first outline entry starts 3 or more pages in, those pages become a "Front matter" stage; a shorter gap joins stage 1.
- **Short numerals:** when most stages are numbered, unnumbered ones get a short numeral ("Intro", "Pref", "Epil") so the map doesn't mix "1" with "I, II".
- **Settings:** a first overlay with the settings that already work (folders, rescan, SD cards, game manuals, theme, fit, gutters, transition, Zen, game layer, daily goal, haptics, reduce motion, debug). Back-grip keys are shown but not yet editable.
- **Library filter row:** the filter chips and sort run across the full width, above the grid and the side panel, so a sixth chip (Manuals) fits.
- **Search (§7.8):** Y opens it from any library tab. The keyboard sits on screen, with results above it updating as you type; an empty query shows recent books. D-pad Up from the top row of keys (or Menu, or the RESULTS key) jumps into the results, where A opens and X shows Book details; B goes back to the keyboard. Every word must match the title, author or file name, by substring or letters in order (for words of 3+ letters). The query is kept while you're away reading.
- **Trophies tab (§7.8, not designed):** cards in the style of Home's trophy card. Global trophies form a 4-wide grid; Per book has one row of three for each book you've opened. Unlocked trophies are gold with their date; locked ones show a progress bar. A shows details. In Light or Off game mode the tab explains that trophies are hidden.
- **Collections (§7.8, not designed):** built in the same style as Home's shelf. Your collections come first, then the smart Papers and Books shelves and a Game manuals shelf per system (all read-only, hidden when empty). Because the smart shelves hold every book, X on any book in this tab opens "Add to collection"; elsewhere X still opens Book details, as §6.3 says. A "New collection" button at the bottom makes an empty shelf.
- **Game manuals (ES-DE), asked for after on-device testing (not in the spec):** PDFs under `downloaded_media/<system>/manuals/` (ES-DE, EmuDeck and RetroDECK all use that folder name) are game manuals, a third kind beside books and papers. They get one smart shelf per system in Collections ("Game manuals · Super Nintendo"), a Manuals filter in the Library (shown only when there are any), a title from the file name without region tags ("Legend of Zelda, The (USA)" → "The Legend of Zelda"), and the system as their author line. They stay off Home's Recently added shelf and are never suggested as "Start reading"; a book in progress beats a manual on the Continue card. They're indexed after books. **Settings → Game manuals (ES-DE)** (on by default) turns this off: manuals are hidden right away and no longer scanned or indexed (their progress stays stored). While it's on, Tome also looks in `~/ES-DE`, `~/Emulation/tools` and `~/retrodeck` for `downloaded_media`, and inside a system folder it only opens `manuals` (it skips covers, screenshots and videos). A custom ES-DE media folder with another name isn't recognised as manuals.
- **In-app keyboard:** D-pad and A type, X deletes, Y adds a space, L1/R1 move the cursor, Menu is done, B cancels. Typing on a physical keyboard (or Steam's) also works while it's open: letters type instead of acting as buttons, and Enter means done.

## Open decisions (spec §16)

These still use the spec's defaults: the runtime (standalone Electron), the XP model (word-weighted pages), Full game intensity, Dim offered for figure-heavy PDFs, the Steam Input layout documented rather than shipped, and the name "Tome".
