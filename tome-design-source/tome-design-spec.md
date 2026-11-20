# Tome — Steam Deck PDF Reader

**Design and implementation spec · v0.1 · 20 Nov 2026**

"Tome" is a working name. The visual reference is the design canvas *Tome — Steam Deck PDF Reader* (https://claude.ai/artifact/SGo49C8kYSCGdK1xhm5hv2). Every screen below names the artboard it comes from (Appendix B).

---

## 0. Read me first (for Claude Code)

- This document is the source of truth for behaviour. The canvas is the source of truth for look. Where they disagree, follow this document and flag the mismatch.
- Items marked **[OPEN]** are not decided yet. Each one has a **Default**. Implement the default behind a config constant or setting, and don't block on the decision. All open items are collected in §16.
- Platform facts marked **(verify on device)** come from general knowledge of SteamOS and need checking on real hardware before you depend on them.
- Build in the milestone order in §15. Keep the logic in `core/` free of UI and platform code, so the reader and game rules can be unit-tested and reused if the runtime changes (§3).
- Ask the owner before you change the control mapping, add network features, or add screens or sections that aren't listed here.
- Design screenshots: the owner can export each artboard from the canvas as a PNG into `design/` using the file names in Appendix B. Use them as visual targets.

---

## 1. Product

**One line:** a PDF reader built for controllers that lives in Steam Deck Game Mode. A light game layer turns reading progress into stages, XP, streaks and trophies.

### Goals
1. Every action works with Deck controls. No touch or keyboard is needed, though touch still works.
2. It runs in Game Mode and launches from the Steam library like a game.
3. The reading surface stays clean. The game layer lives *around* reading and never interrupts it.
4. It handles both books and scientific papers well, including two-column layouts.
5. It's offline. Local files only, no account, no telemetry.

### Non-goals for v1
Highlighting and annotations (bookmarks only), EPUB and other formats, cloud sync, editing PDFs, filling forms, DRM-protected files, text selection or copying.

### Glossary
| Term | Meaning |
|---|---|
| **Stage** | A section of a book: a chapter from the PDF's outline, a detected section of a paper, or an even split when neither exists (§9.5). |
| **Counted page** | A page the reader has actually read, by the dwell rule (§9.2). Only counted pages earn XP or progress. |
| **Cleared** | A stage or book whose completion rule is met (§9.5). Shown in gold. |
| **Session** | The time from opening a book in the reader to leaving it (§9.8). |
| **Focus mode** | The reader with no overlay, the default reading state. |
| **HUD** | The reader overlay toggled with **A**. |
| **Tate mode** | Reading with the Deck held upright (portrait), with the UI rotated 90°. |

---

## 2. Platform facts and constraints

- **Display:** 1280×800, 16:10, about 7". The OLED model has the same resolution and runs at up to 90 Hz. The canvas artboards are 1280×800 CSS px at 1:1.
- **Docked / external display:** scale the whole UI uniformly by `s = min(w / 1280, h / 800)` and centre it, letterboxing with `bg.base`. The reader viewport should use the full window (more pixels means a sharper page), while the HUD scales by `s`.
- **Game Mode** runs apps fullscreen inside the gamescope compositor: no window decorations, no system tray. The Steam overlay can draw on top of the app at any time. Don't use system notifications.
- **Input passes through Steam Input.** A non-Steam app launched from Steam normally sees a virtual Xbox-style gamepad (standard mapping), plus mouse and keyboard events, depending on the controller layout. **(verify on device)** which template non-Steam shortcuts get by default.
- **Reserved:** the Steam button and the Quick Access (⋯) button belong to SteamOS. Never bind them.
- **Back grips (L4, L5, R4, R5) and trackpads** aren't in the standard gamepad mapping. They reach the app only through bindings in the Steam Input layout (§6.5).
- **The SteamOS root filesystem is read-only.** Install into the home directory (AppImage, or Flatpak).
- **Where PDFs usually are:** `~/Documents`, `~/Downloads`, and the SD card mounted under `/run/media/…` **(verify on device)** for the exact mount path.
- **Suspend/resume is frequent** (people press the power button mid-chapter). Save state on every page change and on suspend (§8.8).

---

## 3. Architecture

### 3.1 Runtime target — [OPEN]

| Option | For | Against |
|---|---|---|
| **A. Standalone app** (Electron + TypeScript + React + pdf.js), added to Steam as a non-Steam game | Full control of fullscreen rendering. Chromium's Gamepad API sees Steam Input's virtual pad. The HTML/CSS design carries straight over. Easy to develop on a normal PC with any Xbox-style controller. | Adding a non-Steam game normally needs Desktop Mode **once** at install time. Heavier on memory. |
| **B. Decky Loader plugin** (React inside Steam's UI, Python backend) | Never leaves Game Mode, including at install. Can register a full-screen route. | Runs inside Steam's own UI process. Historically breaks when the Steam client updates. Input arrives through Steam's UI navigation system rather than raw gamepad state. **(verify)** whether the back grips reach a plugin at all. |
| **C. Native** (e.g. Qt/QML + MuPDF + SDL2) | Fastest rendering and lowest memory. SDL has first-class gamepad support. | The UI has to be rebuilt from scratch instead of from the HTML design. Slower to iterate. |

**Default: A (standalone Electron).** Keep `core/` as plain TypeScript with no Electron or DOM imports, so moving to B later only means rewriting `platform/` and adjusting `ui/`.

Avoid Tauri on Linux: it uses WebKitGTK, whose Gamepad API support has been patchy. **(verify)** this if Tauri is ever reconsidered.

### 3.2 Layers (Option A)

```
src/
  core/        pure TS, no DOM or Node APIs, fully unit-tested
    models.ts          types from §4
    gamification/      dwell tracker, XP, levels, streak, daily quest, trophies, stage clearing
    stages/            stage derivation from outline / headings / even split
    input/             logical actions, per-context maps, repeat and deadzone logic, focus graph
    time.ts            reading-day boundary, durations
  pdf/         pdf.js wrapper (runs in the renderer, with pdf.js in a worker)
    document.ts        open, metadata, outline, page sizes
    render.ts          page or tile → ImageBitmap at a scale, LRU cache, prerender
    text.ts            text content → word counts, boxes
    layout.ts          content bounding box (auto-crop), column detection, heading detection
  platform/    Electron main process + preload bridge
    library.ts         folder scan, file watching, hashing
    db.ts              SQLite (better-sqlite3)
    thumbs.ts          cover thumbnails
    power.ts           suspend/resume hooks
    settings.ts
  ui/          React
    tokens.ts          design tokens from §10
    components/        Glyph, PromptBar, Tabs, Chip, Button, Card, SegmentedProgress, HexBadge, Ring, WeekDots, Cover, Toast, StatTile
    screens/           Home, Library, BookDetails, Reader, SessionComplete, Settings, Search, Collections, Trophies
    focus/             focus engine bound to core/input
```

- **Processes:** the main process handles the filesystem, database, thumbnails, power events and the window. The renderer handles UI, pdf.js and gamepad polling. Use a typed IPC layer (one `api.ts` contract shared by both sides).
- **Storage root:** `~/.local/share/tome/`, holding `tome.db`, `thumbs/<bookId>.webp` and `settings.json`.
- **Fonts:** bundle Chakra Petch, Inter and Literata locally (all SIL OFL). Don't load them from Google Fonts at runtime.

---

## 4. Data model

```ts
type BookId = string; // sha1 of (file size + first 1 MiB) — survives renames and moves

interface Book {
  id: BookId;
  path: string;            // last known absolute path
  available: boolean;      // false if the file is missing (e.g. SD card removed)
  title: string;           // PDF Info Title, else prettified filename
  author?: string;
  pageCount: number;
  kind: 'book' | 'paper';  // heuristic, user can override (§7.2)
  hasTextLayer: boolean;
  isTwoColumn: boolean;    // majority of sampled pages detected as 2-col (§8.5)
  addedAt: number;         // epoch ms
  lastOpenedAt?: number;
  stageSource: 'outline' | 'headings' | 'even';
}

interface Stage {
  bookId: BookId;
  index: number;           // 0-based order
  label: string;           // short label, e.g. "Natural Selection"
  numeral?: string;        // "IV", "Intro" — shown in nodes
  startPage: number;       // 1-based inclusive
  endPage: number;         // inclusive
  isFinal: boolean;        // last stage → drawn as the hex "final stage" node
}

interface ReadingState {
  bookId: BookId;
  page: number;
  scrollY: number;         // 0..1 within the page (or within the column segment)
  segment?: number;        // column-mode segment index (§8.5)
  zoom: number;            // relative to fit, 1 = fit
  fit: 'width' | 'page' | 'column';
  themeOverride?: PageTheme;
  orientation: 'landscape' | 'tate-left' | 'tate-right';
}

interface PageProgress {   // one row per (book, page) once touched
  bookId: BookId;
  page: number;
  dwellMs: number;         // accumulated visible time
  viewedFraction: number;  // 0..1 of page area seen (§9.2)
  counted: boolean;
  countedAt?: number;
}

interface Bookmark { id: string; bookId: BookId; page: number; scrollY: number; createdAt: number; }

interface Session {
  id: string; bookId: BookId;
  startedAt: number; endedAt?: number;
  activeMs: number;
  startPage: number; endPage?: number;
  countedPages: number;
}

interface XpEvent {        // append-only ledger; level and totals are derived from it
  id: string; at: number; amount: number;
  reason: 'page' | 'stage_clear' | 'daily_quest' | 'book_clear';
  bookId?: BookId; stageIndex?: number; page?: number; sessionId?: string;
}

interface TrophyUnlock { trophyId: string; bookId?: BookId; at: number; }

interface Collection { id: string; name: string; smart?: 'papers' | 'books'; bookIds: BookId[]; }

type PageTheme = 'paper' | 'sepia' | 'night' | 'dim';
```

Derive totals (total XP, level, streak, books cleared) from the ledger and progress tables. Don't store them as mutable counters. If you need to cache them for speed, make the cache rebuildable.

---

## 5. Navigation map

```
Launch ─▶ HOME tab (focus: Continue hero, or first cover if nothing in progress)
           ├─ L1/R1 ─▶ HOME · LIBRARY · COLLECTIONS · TROPHIES (top tabs, wrap around)
           ├─ A on book ─▶ READER (resume at saved position)
           ├─ X on book ─▶ BOOK DETAILS / STAGE MAP
           ├─ Y ─▶ SEARCH
           ├─ ☰ ─▶ SETTINGS
           └─ B on Home ─▶ "Quit Tome?" confirm (A quit · B cancel)

BOOK DETAILS ─ A on stage ─▶ READER at that stage
             ─ Y ─▶ GO TO PAGE
             ─ X ─▶ BOOKMARKS list
             ─ B ─▶ back to where it was opened from

READER (focus mode)
   ├─ A ─▶ HUD on/off (reading input still works while it's open)
   ├─ Y ─▶ STAGE MAP overlay (same component as Book details, right half), B closes
   ├─ ☰ ─▶ DISPLAY menu (theme, fit, gutters, tate, brightness hint)
   ├─ X ─▶ toggle bookmark (toast: "Bookmarked p. 96" / "Bookmark removed")
   └─ B ─▶ save ─▶ SESSION COMPLETE (if ≥1 counted page or any XP) else ─▶ previous screen

SESSION COMPLETE ─ A ─▶ previous library screen · Y ─▶ back into READER
```

Each screen remembers its last focused element. Coming back restores focus there.

---

## 6. Input system

### 6.1 Logical actions

The UI never reads buttons directly. `core/input` turns raw gamepad, keyboard and mouse state into **actions** for the current **context**, and screens only handle actions.

```ts
type Action =
  | 'nav_up' | 'nav_down' | 'nav_left' | 'nav_right'
  | 'confirm' | 'back' | 'secondary' | 'tertiary'          // A, B, X, Y
  | 'tab_prev' | 'tab_next'                                 // L1, R1 in library
  | 'filter_prev' | 'filter_next'                           // L2, R2 in library
  | 'view' | 'menu'
  | 'page_prev' | 'page_next' | 'stage_prev' | 'stage_next'
  | 'scroll' /* analog, value -1..1 */ | 'pan' /* analog vec2 */
  | 'zoom' /* analog, -1..1: R2 − L2 */ | 'zoom_reset'
  | 'link_back';
```

### 6.2 Standard gamepad mapping (W3C "standard" layout)

| Index | Button | Index | Button |
|---|---|---|---|
| 0 | A | 8 | View (⧉) |
| 1 | B | 9 | Menu (☰) |
| 2 | X | 10 | Left stick click (L3) |
| 3 | Y | 11 | Right stick click (R3) |
| 4 | L1 | 12–15 | D-pad up, down, left, right |
| 5 | R1 | 16 | Guide (ignore — it's Steam's) |
| 6 | L2 (analog value) | axes 0/1 | left stick x/y |
| 7 | R2 (analog value) | axes 2/3 | right stick x/y |

**Picking the device:** choose the gamepad with `mapping === 'standard'` that most recently had input, and ignore the rest. More than one device may show up, e.g. the virtual pad plus a raw controller **(verify on device)**. Show connected gamepads in a debug overlay (toggle with a dev setting).

**Polling:** poll in `requestAnimationFrame`. Drop to about 20 Hz after 10 s with no input and no animation, to save battery.

### 6.3 Per-context maps

**Library (Home, Library, Collections, Trophies tabs)**

| Input | Action |
|---|---|
| D-pad / left stick | Move focus |
| L1 / R1 | Previous / next tab |
| L2 / R2 | Previous / next filter chip (Library tab) |
| A | Open / resume the focused book |
| X | Book details / stage map for the focused book |
| Y | Search |
| View | Sort menu |
| Menu | Settings |
| B | Back; on Home, the quit confirm |

**Book details / stage map**

| Input | Action |
|---|---|
| D-pad | Move between stage nodes by screen position (works on the reversed middle row) |
| L1 / R1 | Previous / next stage in reading order |
| A | Jump to the stage (current stage → resume position; otherwise the stage's first page) |
| Y | Go to page |
| X | Bookmarks list |
| B | Back |

**Reader (focus mode and HUD)**

| Input | Action |
|---|---|
| R1 / L1 | Next / previous page |
| D-pad ← / → | Next / previous page |
| D-pad ↑ / ↓ | Scroll by 80 % of the viewport. At a page edge, go to the previous page's bottom or the next page's top. In Column mode, move to the next or previous column segment (§8.5). |
| Left stick (y) | Smooth scroll, stopping at the page edge (no auto page turn) |
| Right stick | Pan when zoomed past fit. R3 click resets zoom to fit. |
| R2 / L2 (analog) | Zoom in / out, faster the harder you pull (§6.4) |
| A | HUD on/off |
| X | Toggle bookmark on the current page |
| Y | Stage map overlay (stage list plus go to page) |
| View | Cycle fit: width → page → column (column only if the page is detected two-column) |
| Menu | Display menu |
| B | Save and leave (session summary rule in §5) |
| L3 click | Return from a followed link (only while link history isn't empty) |
| R4 / L4 | Next / previous page (one-handed) |
| R5 / L5 | Next / previous stage |
| Right trackpad | Pointer. A click follows links; dragging pans. |
| Left trackpad | Scroll with momentum (mouse wheel) |

**Tate mode:** the same map, but directional input (D-pad, sticks, trackpads) is rotated by the same 90° as the screen. "Up" always means towards the top of the page as the reader sees it. The prompts advertise the back grips on the lower grip: Tate-L shows **L4 next · L5 back**, Tate-R shows **R4 · R5**.

**Overlays and dialogs:** D-pad moves focus, A confirms, B closes. Overlays capture all input.

### 6.4 Timing and curves (constants in `core/input/config.ts`)

| Setting | Value |
|---|---|
| D-pad / stick-nav repeat | first repeat after 350 ms, then every 90 ms |
| Stick deadzone | 0.25 radial; nav threshold 0.5 |
| Scroll speed (left stick) | `v = 2400 px/s × ((|y| − 0.25) / 0.75)^1.6`, sign from y |
| Trigger deadzone | 0.08 |
| Zoom rate | `zoom *= exp(1.6 × t² × dt)` per frame, `t` = trigger value after deadzone; clamp 0.5×–4× of fit; zoom about the viewport centre, or about the pointer if a trackpad touched it in the last 2 s |
| Page-edge bump | D-pad ↓ at the bottom edge first shows a 150 ms "bump" (8 px overscroll), then the next press turns the page |
| Long-press | not used in v1 (keeps the controls predictable) |

### 6.5 Back grips and trackpads (Steam Input layout)

Standard gamepad input has no back grips, so map them to keys in the Steam Input layout and have the app listen for those keys. The bindings are configurable in Settings so they match whatever the user sets.

| Physical | Default Steam Input binding | App action (landscape) |
|---|---|---|
| R4 | Keyboard **Page Down** | page_next |
| L4 | Keyboard **Page Up** | page_prev |
| R5 | Keyboard **]** | stage_next |
| L5 | Keyboard **[** | stage_prev |
| Right trackpad | Mouse (default) | pointer |
| Left trackpad | Scroll wheel | scroll |

Write `docs/steam-input-layout.md` with step-by-step binding instructions and screenshots. **(verify on device)** whether a layout can be exported or imported for a non-Steam shortcut, or installed by a script. If it can, ship it. The canvas currently says the app "ships with a Steam Input layout". Treat that as the goal, and adjust the copy if it turns out only to be documentation.

**Keyboard fallback for development:** arrows = D-pad, Enter = A, Esc/Backspace = B, X/Y keys = X/Y, Q/E = L1/R1, Z/C = L2/R2 (held = full trigger), Tab = View, M = Menu, PageUp/PageDown = L4/R4, `[`/`]` = L5/R5.

### 6.6 Focus engine

- Each screen declares an explicit focus graph (node ids plus up/down/left/right neighbours) rather than relying on purely geometric navigation. It's deterministic and easy to test. Grids and rows can generate their graphs.
- One element is focused at a time. **Focus style:** `outline: 3px solid cyan; outline-offset: 3px;` plus `box-shadow: 0 0 0 8–9px rgba(88,199,230,0.14–0.16), 0 16–24px 32–48px rgba(0,0,0,0.45–0.5)`. Covers also lift with `translateY(-4px)`. Transition 120 ms ease-out.
- Rows and grids scroll to keep the focused item plus one item of look-ahead visible.
- The footer prompt bar always shows the actions available for the focused element and context. Prompts are data (`{glyph, label}[]`) supplied by the focused component.

### 6.7 Haptics (optional)

A light tick on page turn and a double tick on stage clear, via `gamepad.vibrationActuator` where it's supported. Off when Settings → Haptics is off.

---

## 7. Screens

### 7.0 Global shell (library screens)

- **Header (76 px):** bottom border `line.1`, 40 px side padding, three zones.
  - **Left (300 px):** logo — a 30 px open-book stroke icon in cyan, plus "TOME" in Chakra Petch 700 22 px with letter-spacing .18em.
  - **Centre:** tabs `HOME · LIBRARY · COLLECTIONS · TROPHIES`, framed by **L1** and **R1** glyphs. Each tab is a button the full height of the header with 0 16 px padding, Chakra Petch 600 16 px, letter-spacing .08em. Active: `text.primary` with a 3 px gold inset underline. Inactive: `text.muted`.
  - **Right (300 px):** level hex (42×38, gold, level number in Chakra 700 16 px, `gold.on`), XP bar (120×6, radius 3, gold fill on `track`), "1,240 / 2,000 XP" in 12 px `text.muted`, then a streak flame icon with "6 DAYS" in Chakra 700 16 px gold.
- **Footer prompt bar (60 px):** background `bg.footer`, top border `line.1`, items right-aligned with a 28 px gap. Each item is a glyph plus a label in Inter 500 15 px `text.secondary`, with a 10 px gap. The primary action comes first, B comes last.
- **Content area:** 40 px side padding, 24–28 px top padding.

### 7.1 Home — artboard `Main`

**Purpose:** get back into reading in one press, and show the day's game state.

**Layout:** main area with padding 28/40/0 and a 30 px vertical gap.

1. **Top row (300 px tall):** the Continue hero (flexible width) and a 372 px side column, with a 24 px gap.
   - **Continue hero** (radius 20, padding 22, `surface.1`, border `line.3`). **It has focus at launch.**
     - Cover 180×254 (§7.9) on the left, with a 28 px gap.
     - Text column, top to bottom: eyebrow "CONTINUE READING" (Chakra 600 13 px, .16em, cyan); title (Chakra 600 32 px); author (16 px `text.muted`); meta line "4 h 12 m read · last session yesterday · 3 bookmarks" (14 px `text.dim`); a flexible spacer; progress label row ("STAGE 5/15 · IV — Natural Selection" on the left with "STAGE 5/15" in Chakra 600; "p. 96 / 528 · 18%" on the right; 13 px); a **segmented stage bar** (one equal-width segment per stage, 10 px tall, 4 px gap, radius 3; cleared = gold, current = track with a cyan fill showing progress within the stage, future = track); actions with an 18 px top margin: **RESUME** (primary, A) and **STAGE MAP** (secondary, X).
     - If nothing is in progress, show "START READING" with the most recently added unread book.
   - **Side column** (two cards, 16 px gap, each radius 18, padding 18/20, `surface.1`, border `line.2`):
     - **Daily quest:** a 64 px ring (stroke 7, track `track`, progress gold, pages-read-today number in the centre in Chakra 700 17 px); "DAILY QUEST" eyebrow (gold 12 px .16em); "Read 25 pages" (18 px 600); "7 / 25 · +50 XP when done" (13 px muted). Below that, **week dots**: seven 24 px circles labelled M–S (qualified day = gold fill with dark letter; today not yet qualified = 2 px cyan outline with cyan letter; future or missed = `surface.button2` with dim letter), and on the right "Read today to keep it" (12 px dim). Once the quest is done, the ring is full and the text reads "Done · +50 XP".
     - **Next trophy:** a nested hex badge (60×54 outer `gold.border`, 52×46 inner `surface.hexInner`, a 22 px gold stroke icon); "NEXT TROPHY" eyebrow; name (18 px 600); description (13 px muted); a segmented progress bar (8 px, one segment per step if there are ≤10 steps, otherwise a continuous bar) and a "6/7" count. It shows the closest unearned trophy by fraction complete.
     - Both cards are focusable. A opens the Trophies tab.
2. **Shelf "RECENTLY ADDED":** heading in Chakra 600 18 px .08em; on the right "7 of 42 · R2 all books" (13 px dim). There's a row of covers (148×208, 20 px gap), each with a 4 px progress bar below it (gold fill; 10 px gap). Badges: **NEW** (top-left cyan pill, Chakra 700 10 px, `bg.base` text) for books never opened; **Cleared** (top-right 26 px gold circle with a dark check). The row scrolls horizontally with focus.
   - **[OPEN]** Extra shelves below ("Papers", "In progress") that would make Home scroll vertically. **Default:** one shelf only, as designed.

**Focus graph:** hero → right goes to the Daily quest card → down to the Next trophy card. Hero → down goes to the first cover. The shelf moves left/right. Up from the shelf returns to the hero.

**Footer:** A Resume/Open · X Stage map · Y Search · View Sort · Menu Settings · B Quit.

### 7.2 Library — artboard `LibraryGrid`

**Purpose:** browse everything.

**Layout:** the content row has a grid column (flexible) and a 340 px **Selected book** panel, with a 32 px gap.

- **Filter row:** an **L2** glyph, then chips (36 px tall, radius 18, Chakra 600 13 px .08em; active = gold fill with `gold.on` text; inactive = `surface.1` with a `line.4` border and `text.secondary`): `ALL n · READING n · UNREAD n · CLEARED n · PAPERS n`, then an **R2** glyph. On the right, a View glyph with "Sort: **Last read**". Sort options: Last read, Title, Recently added, Progress.
- **Grid:** 5 columns, column gap 22, row gap 26. Each item is a cover 200 px tall (width from the column), a title (13 px, one line, ellipsis; `text.muted`, or `text.primary` 600 when focused) and a 4 px progress bar (gold; **cyan when focused**). A 90 px gradient fades the bottom edge into `bg.base` so rows read as scrolling.
- **Selected book panel** (radius 20, padding 24, `surface.1`, border `line.3`):
  - Eyebrow "PAPER · 18 PAGES" / "BOOK · 528 PAGES" (cyan).
  - Title in Chakra 600 24 px; filename in 13 px monospace `text.dim`.
  - Stage label row and a segmented stage bar (as on Home).
  - Three stat cells: time read, bookmarks, time since last read (value in Chakra 700 20 px, label 12 px dim).
  - A conditional callout (inset `surface.inset`, radius 14): when `isTwoColumn`, a two-column icon and "Two-column layout detected. Opens in **Column mode**: scroll down one column, then jump to the top of the next."
  - Actions pinned to the bottom: **CONTINUE** (A, primary, flexible width) and **MAP** (X, secondary).
- **Empty filter:** "Nothing here yet", with a short hint per filter (e.g. Cleared: "Finish every stage of a book to clear it.").
- **Kind heuristic:** `paper` if pageCount ≤ 60 **and** (isTwoColumn **or** a heading named Abstract or References is detected); otherwise `book`. The user can change it from the Book details screen via Menu.

**Footer:** A Open · X Stage map · Y Search · L2/R2 Filter · View Sort · B Home.

### 7.3 Book details and stage map — artboard `BookDetails`

**Header:** breadcrumb "HOME / <TITLE>" (Chakra 600 14 px .12em; the title in `text.primary`) plus the level block on the right.

**Left panel (340 px):**
- Cover 120×168 next to the title (Chakra 600 24 px), the author, "PDF · 528 pages", the percent of pages counted (Chakra 700 28 px gold) and "p. 96 of 528" (12 px dim).
- A 2×2 grid of stat tiles (radius 14, padding 14, `surface.1`): **time read**, **left at your pace** (remaining pages × this book's median active seconds per counted page; until there are 10 counted pages, use the global median; show "~19 h"), **sessions**, **bookmarks**.
- **BOOK TROPHIES n / 3:** three rows, each with a 36×32 hex. Unlocked: gold hex with a check, name and description. Locked: track-coloured hex; measurable ones show a 4 px bar and a "18 / 50%" count.

**Stage map (right):**
- Heading "STAGE MAP" (Chakra 600 18 px) and a source note on the right (13 px dim): "n stages · from the PDF's outline" / "· from detected section headings" / "· split evenly — no outline found".
- **Serpentine path:** 5 nodes per row. Row 1 runs left to right, row 2 right to left, row 3 left to right, and so on. In an 820 px wide map area, node centres sit at x = 65, 237.5, 410, 582.5, 755 with a 150 px row pitch. The path lines are 4 px: segments up to the current node are gold, the rest `track`, and the vertical connectors alternate right and left.
- **Node states** (56 px circles):
  - **Cleared:** gold fill with a dark 22 px check.
  - **Current:** `surface.inset` fill, 3 px cyan border, cyan numeral, a "YOU ARE HERE" tag above (Chakra 700 10 px .14em cyan) and the focus ring when focused.
  - **Future:** `surface.node` fill, 2 px `line.4` border, numeral in `text.muted`.
  - **Final stage:** a vertical hex, 68×72 outer and 60×64 inner, with a trophy icon and the label "FINAL STAGE" in gold.
- **Labels** sit under each node (13 px, at most 2 lines, 130 px wide). Cleared and current labels show the numeral line too.
- **More than 15 stages:** the map scrolls vertically by rows, keeping the focused row centred. **More than 40:** compact mode with 40 px nodes and 7 per row.
- **Focused-stage card** (bottom, radius 18, `surface.1`):
  - Eyebrow "STAGE IV · IN PROGRESS" (states: CLEARED / IN PROGRESS / NOT STARTED).
  - Name in Chakra 600 22 px; "p. 94–141 · 48 pages".
  - A progress bar of counted pages in the stage ("3 of 48 pages") with the reward on the right: "CLEAR FOR +100 XP", or "CLEARED" with a check.
  - **JUMP HERE** (A) primary button.

**Footer:** D-pad Choose stage · A Jump here · Y Go to page · X Bookmarks · B Back.

In the reader, **Y** opens the same stage map as an overlay (map and focused-stage card only, over a dimmed page).

### 7.4 Reader, focus mode — artboard `Reader`

- **Background / gutters:** `bg.reader`. The page is centred with a `0 0 60px rgba(0,0,0,.6)` shadow.
- **Fit width (default for books):** the page's *content box* (after auto-crop, §8.6) fills 1060 px, which leaves 110 px gutters at 1280 px width. Gutter setting: Wide 110 / Narrow 40 / None 0.
- **Overlay elements, and nothing else:**
  - **Position within the page:** in the right gutter, 46 px from the edge and vertically centred, a 4×160 px track (`#1C2133`) with a thumb (`#4A5478`) sized viewport ÷ page height.
  - **Page counter:** bottom-right "96 / 528", Chakra 600 14 px, `text.dim`, 18 px from the bottom and 28 px from the right.
  - **Book progress line:** 4 px tall along the bottom edge, gold fill over `#161B2B`.
  - **Toast slot:** top-right, inset 24 px, 370 px wide (§7.10).
- A **Zen** setting hides the counter, the position track and the progress line.
- **Landscape-shaped pages** (aspect > 1.2, e.g. slides) default to **fit page**.

### 7.5 Reader HUD — artboard `ReaderHUD`

Toggled with **A**. It slides and fades in over 150 ms and stays open until A or B. Page turns, scrolling and zoom keep working while it's open.

- **Top bar (72 px):** `rgba(10,13,24,.95)`, bottom border `line.1`, 28 px padding.
  - Left: **B** glyph + "Library", a vertical divider, then the title (Chakra 600 17 px) with "Stage 5/15 · IV — Natural Selection" below it (13 px muted).
  - Right: three chips (34 px, radius 17): session timer (clock icon + mm:ss), "+12 PAGES" (counted this session), "+160 XP" (gold chip: `gold.surface` fill, `gold.border` border).
- **Edge hints:** vertically centred in the gutters, "‹ L1" on the left and "R1 ›" on the right (chevron + shoulder glyph, `text.secondary`).
- **Bottom panel:** `rgba(10,13,24,.96)`, top border `line.1`, padding 20/28/18, 16 px gap.
  - **Scrubber row:** book percent (Chakra 700 14 px gold, 44 px wide), then a track built from **stage segments whose width is proportional to page count** (8 px tall, 3 px gap; cleared gold, current track with a cyan fill showing progress within the stage, future track, final stage `gold.border`). Bookmarks are 10 px gold diamonds sitting 6 px above the track. The current position is a 22 px knob (`bg.base` fill, 4 px cyan border, `0 0 0 5px rgba(88,199,230,.2)` halo). On the right, "p. 96 / 528" (Chakra 600 14 px, 96 px wide, right-aligned).
    - In v1 the scrubber is a display only. Navigation goes through **Y** (stage map / go to page). Making it interactive later needs a free input; flag it before adding.
  - **Mode chips + prompts row:** on the left, chips (32 px, radius 8) "FIT **WIDTH**", "ZOOM **135%**", "PAGE **PAPER**"; on the right, prompts: L1/R1 Page · L2/R2 Zoom · X Bookmark · Y Stage map · View Fit · Menu Display · A Hide.
- **The home screen deliberately uses equal stage segments** (they read as stages) **and the HUD proportional ones** (they read as position). Keep the two different.

### 7.6 Reader, tate mode — artboard `ReaderTate`

- **Screen as the reader sees it:** 800×1280. The whole page fits with a 20 px margin (fit page). Above the bottom bar there's a 4 px progress line.
- **Bottom bar (64 px, `bg.footer`):** on the left "TATE · **96 / 528**" (Chakra 600 13 px); on the right, prompts **L4 Next · L5 Back · D-pad Page · View Rotate**. The back-grip glyphs are outlined (§10.4).
- **Orientations:**
  - **Tate-L:** the device is rotated 90° counter-clockwise, so the D-pad, left stick and L4/L5 end up at the bottom. The UI is rotated +90° (clockwise).
  - **Tate-R:** the opposite.
  - Toggle with **View** while in tate (View → Rotate, with a confirm toast). Enter or leave tate from the Display menu.
- **Implementation:** render the whole app root inside a container with swapped dimensions and `transform: rotate(±90deg)`, so overlays, HUD and toasts rotate with it. Rotate directional input to match (§6.3).
- **HUD in tate:** the same components stacked vertically to fit 800 px. Not designed yet — keep it minimal: a top bar (title + chips) and a bottom panel (scrubber + two rows of prompts).
- **Trade-off:** a whole page at 760 px wide gives small body text (about 17 px for a typical book page). For two-column papers, landscape Column mode reads better. The first time a two-column PDF is put in tate, show the tip "Tip: Column mode in landscape gives larger text."

### 7.7 Session complete — artboard `SessionComplete`

Shown after **B** in the reader when the session has ≥1 counted page or any XP. Otherwise go straight back.

- **Background:** the last page, blurred (10 px) at 50 % opacity, under an `rgba(7,9,15,.86)` scrim.
- **Panel:** 960 px wide, 56 px from the top, centred, padding 34/36/32, radius 24, `surface.modal`, border `line.3`, shadow `0 30px 80px rgba(0,0,0,.6)`. Contents:
  - "On the Origin of Species · p. 78 → 96" (14 px muted).
  - "SESSION COMPLETE" (Chakra 700 44 px .08em).
  - **Three stat tiles** (radius 16, padding 18/20): pages read · reading time · XP earned. The XP tile is gold (`gold.surface` fill, `gold.border` border, gold value, `gold.textSoft` label). Values are in Chakra 700 40 px.
  - **Left column — XP breakdown:** one line per XP reason (label in `text.secondary` with detail in `text.dim`; value right-aligned in Chakra 700 15 px gold), e.g. "Pages read × 18 · +90", "Stage clear · III Struggle for Existence · +100", "Daily quest · 25 / 25 pages · +50". Then a divider and the **level row**: the level hex plus a 12 px bar where XP before the session is `gold.deep` and the XP gained is bright gold with a glow, filling over 800 ms; below it "**1,480** / 2,000 XP" and "520 to level 15".
  - **Right column (340 px):**
    - **Streak card:** flame + "7-DAY STREAK" (Chakra 700 16 px gold), "Personal best" on the right when it is one, and week dots (28 px). The day just qualified gets a gold halo.
    - **Trophy unlocked card(s):** `gold.surface2` fill, `gold.border2` border, a 30 px gold glow, a solid gold hex with a dark icon, "TROPHY UNLOCKED" eyebrow, name (17 px 600) and description (13 px `gold.textSoft`). Show at most two cards, then "+n more".
  - **Level up** (not designed): replace the level row with "LEVEL UP · 15" in gold, then show the new level's bar.
- **Footer:** Y Keep reading · A Back to library. The A glyph is gold to mark it as the default.

### 7.8 Screens not designed yet (keep them in the same system)

| Screen | Minimum spec |
|---|---|
| **Trophies tab** | A grid of hex badges (unlocked gold, locked track with a progress bar), grouped Global / Per book. A on a badge shows its details. |
| **Collections tab** | Rows of shelves, one per collection. Smart collections (Papers, Books) are read-only. Menu on a collection: rename / delete. X on a book: add to collection. |
| **Search** | A text field plus an **on-screen keyboard grid built into the app** (letters, digits, space, backspace; D-pad + A; L1/R1 move the cursor; Y = space, X = backspace, Menu = done). Don't rely on Steam's keyboard (Steam + X) popping up. Results update live with a fuzzy match on title, author and filename. |
| **Settings** | A list of sections with a value on the right of each row; A edits; left/right change enum values in place. Full list in §11. |
| **Display menu** (reader, Menu) | A right-side sheet 360 px wide: Theme (Paper/Sepia/Night/Dim), Fit, Gutters, Auto-crop, Tate (off/L/R), "Apply to this book only" toggle. |
| **Go to page** | A centred dialog: a large page number with D-pad ↑/↓ ±1, ←/→ ±10, L1/R1 ±100; A go; B cancel. |
| **Bookmarks list** | A list of page thumbnails (120 px) with the page number and stage; A jump; X delete. |
| **First run / empty library** | "Add a folder with PDFs" with A → a folder picker built into the app (the system dialog is unusable in Game Mode), pre-listing `~/Documents`, `~/Downloads` and SD cards. |
| **Errors** | Password-protected → a password prompt using the in-app keyboard. Corrupt/unsupported → "Can't open this PDF", with the file name and "Remove from library". Missing file → the cover greyed out with an "Not available" badge. |

### 7.9 Covers (generated)

- Render page 1 at the cover size (2× for sharpness on dock), at 148:208 (≈0.71). Fit page 1 inside and fill the leftover with an average of page 1's edge colour.
- Cache as WebP in `thumbs/`. Generate in the background at low priority, a few at a time, newest first. Until a cover is ready, show a placeholder: `surface.node` with the title in Literata 600 at 14 px.
- **Badge rules:** NEW = never opened. Cleared = book clear rule met (§9.5). Missing = greyed out at 40 % opacity with a "Not available" badge.
- The mock covers on the canvas are stand-ins. Real covers come from the PDF.

### 7.10 Toasts

- Top-right with a 24 px inset, 370 px wide, radius 16, `rgba(13,17,32,.95)`, border `gold.toastBorder`, shadow `0 18px 40px rgba(0,0,0,.55)`. Contents: a 46×42 gold hex with a dark icon, an eyebrow (Chakra 700 12 px .16em gold) and a line (15 px 600), with the value on the right (Chakra 700 20 px gold).
- Kinds: Stage clear · Trophy unlocked · Daily quest done · Level up · Bookmark added/removed (neutral style: `line.3` border, cyan icon, no value).
- Slide in from the right over 250 ms, hold 4 s, fade out over 200 ms. Show one at a time in a queue. Never show a toast within 1.5 s of a page turn — delay it instead. Use `role="status"`.

---

## 8. Reader engine

### 8.1 Rendering

- pdf.js with its worker. Render pages to `ImageBitmap` at `scale = targetWidthPx / pageWidthPt`.
- An **LRU cache** of six bitmaps at the current scale. After 100 ms idle, prerender the next two pages and the previous one.
- **Zoomed past 2.5× of fit:** switch to 512 px tiles rendered on demand. Show the scaled-up page-level bitmap as a placeholder until the tiles arrive.
- **Uncached page turn:** show a low-resolution (0.25×) render first, then swap in the full one.
- The text layer is never displayed in v1. It's used for word counts (§9.2), column detection (§8.5), heading detection (§9.5) and auto-crop.

### 8.2 Scroll model: pages with scrolling inside them

The page is the unit. Within a page, scroll vertically. R1/L1, D-pad ←/→ and R4/L4 always jump a whole page and land at the **top**. D-pad ↑ at the top goes to the previous page's **bottom**. Page transitions are a 120 ms slide (setting: Slide / Instant).

### 8.3 Fit modes

| Mode | Behaviour | Default when |
|---|---|---|
| **Width** | The content box width fills the viewport minus gutters | Books (single column) |
| **Page** | The whole page fits in the viewport | Landscape pages (aspect > 1.2); tate mode |
| **Column** | Viewport fits one column segment (§8.5) | `isTwoColumn` books (papers) |

Fit is stored per book in `ReadingState`. View cycles Width → Page → Column (Column only appears if the current page has columns).

### 8.4 Zoom and pan

The triggers give analog zoom (§6.4), and the HUD chip shows the zoom relative to fit. Past fit, the right stick pans (speed curve as for scrolling, 1800 px/s max) and the right trackpad drags. R3 resets to fit.

### 8.5 Column mode (papers)

**Detection (per page, cached):**
1. **With a text layer:** take the text item boxes in the content area. Look for a **gutter**: a vertical strip whose centre lies between 35 % and 65 % of the content width, at least 1.5 % of the width wide, that ≤5 % of item boxes cross over ≥50 % of the content height. Rows (y-ranges) where items *do* cross the gutter become **full-width bands** (title, abstract, wide figures).
2. **Without a text layer** (scans): render at 300 px width in greyscale and binarise (Otsu). Within the body region, compute the column-wise ink projection profile and take the longest near-zero run in the middle 30 % of the width as the gutter. Bands are y-ranges where ink crosses the gutter.
3. Mark the book `isTwoColumn` if ≥60 % of up to 10 sampled body pages (skip the first page) are two-column.

**Reading order per page:** the segments, top to bottom: each full-width band (at fit width), then the left-column region, then the right-column region, until the next band, and so on. v1 handles two columns plus full-width bands. If detection confidence is low, fall back to Width.

**Navigation:** the viewport fits the segment width plus 24 px padding into the 1060 px content area. D-pad ↓ steps 80 % of the viewport within a segment. At the segment's end, the next press pans in 200 ms to the top of the next segment. After the last segment it goes to the next page's first segment. R1 still turns the whole page.

### 8.6 Auto-crop margins

The content box is the union of text item boxes (or the bitmap ink bounding box), padded by 2 % of the page width. To stop the page jumping in size from page to page, use the **median** box of up to 20 sampled pages, separately for odd and even pages, unless a page's own box sticks out of it (then that page uses the union). On by default; setting: Auto-crop.

### 8.7 Page themes

| Theme | How it's made | Page background / ink |
|---|---|---|
| **Paper** (default) | Multiply the rendered page with the paper colour, so white becomes paper and black stays black | `#F4EEE1` / page ink |
| **Sepia** | Multiply with sepia | `#E9D9BC` / page ink |
| **Night** | Invert, hue-rotate 180° (to keep hues), then map linearly to the range `#171A22`→`#D8D2C4` (WebGL or canvas filter) | `#171A22` / `#D8D2C4` |
| **Dim** | Brightness ×0.6 with a slight warm tint, no inversion | — |

**Figures:** Night inverts images too. An inverted fluorescence micrograph, gel or heatmap isn't just ugly — it's misleading. v1: offer **Dim** as the night option for figure-heavy PDFs, and keep a per-book theme override. v2 idea: get image bounding boxes from pdf.js's operator list (`paintImageXObject` and similar), and composite the original pixels back over those regions after inverting.

The canvas mock pages use Literata to stand in for PDF content. Real pages always render the PDF's own fonts.

### 8.8 Position persistence

Write `ReadingState` 1 s after each change (debounced), on every page change, every 10 s while reading, on `powerMonitor` `suspend`, and on quit. On launch, restore exactly: page, scroll position within the page, segment, zoom and fit.

### 8.9 Links and outline

Clicking an internal link with the right trackpad jumps to its target and pushes the previous position onto a history stack. While the stack isn't empty, the HUD shows a "↩ Back to p. 96 · L3" chip, and **L3** pops the stack. External links: show "Open links on another device", with the URL shown and nothing opened.

---

## 9. Game layer rules

### 9.1 Principles

- **It never interrupts reading.** No modal dialogs while reading; only toasts (§7.10).
- **No penalties** beyond a streak resetting. No guilt messages or nagging notifications.
- **Intensity setting:** **Full** (as designed) / **Light** (stages, stage map and streak only; no XP, levels or trophies anywhere in the UI) / **Off** (only progress bars and the page count). In Light and Off the engine keeps tracking quietly, so turning Full back on restores everything.
- **Anti-cheese:** jumping (stage map, go to page, link) never counts pages. A page earns XP only once per book. Re-reading adds time stats but no XP.

### 9.2 Counting a page

A page becomes **counted** when both of these hold:
1. **Dwell:** the page has been visible for at least `T` seconds in total, where
   `T = clamp(0.072 × words, 4, 45)` (about 30 % of the reading time at 250 wpm). Pages with no text layer: `T = 15`.
   Dwell only accumulates while the app is focused and there's been input or a page change in the last 5 minutes (idle cap).
2. **Coverage:** at least 70 % of the page area (or of its segments in Column mode) has been inside the viewport. In fit page, coverage is 100 % immediately.

All constants live in `core/gamification/config.ts`.

### 9.3 XP — [OPEN] pages vs time

**Default (word-weighted pages):**

| Event | XP |
|---|---|
| Counted page | `clamp(round(words / 60), 2, 12)`; no text layer: 5 |
| Stage clear | 100 if the stage has ≥10 pages, otherwise `max(20, 10 × pages)` |
| Daily quest done | 50 |
| Book clear | 500 |
| Trophy | 0 (the trophy is the reward) |

Why: a dense two-column paper page holds about three times the text of a paperback page, so a flat XP per page would reward paperbacks. Alternative to consider: XP per active reading minute. Put both behind `xpModel: 'pages' | 'time'`.

### 9.4 Levels

`xpToNext(L) = 600 + 100 × L`. Start at level 1 with 0 XP. (In the mock fixture, level 14 needs 2,000 to reach level 15.) Derive level and progress from the XP ledger total.

### 9.5 Stages

**Derivation**, in order:
1. **Outline:** use the top-level entries that resolve to pages. If there are fewer than 3 top-level entries and the second level has 3–40, use the second level. Drop entries before page 2 that cover ≤1 page (e.g. "Cover") by merging them into the next stage. Label = the outline title with any leading "Chapter IV."-style prefix moved into `numeral`.
2. **Headings** (no usable outline, text layer present): find lines whose font size is ≥1.2× the median body size, or that match common section names (`Abstract, Introduction, Background, Results, Discussion, Conclusion(s), Methods, Materials and Methods, References, Acknowledg(e)ments, Supplementary`). Use them if 3–40 are found.
3. **Even split:** `n = clamp(round(pageCount / 25), 3, 10)` stages named "Part 1…n".

Each stage runs from its start page to the page before the next stage starts. The last stage is `isFinal`.

**Clearing:** a stage is **cleared** when ≥90 % of its pages are counted, or when the reader reaches its last page with ≥70 % counted. A stage can't be cleared by jumping over it.

**Book clear:** every stage cleared, or the last page reached with ≥80 % of all pages counted. It awards the per-book trophy "Cover to Cover".

### 9.6 Daily quest and streak

- **Reading day:** starts at **04:00 local time**, so a late-night session counts towards the previous day. Use the device's timezone; handle DST by computing day keys from local wall-clock time.
- **Daily quest:** read N counted pages in the day (default N = 25; setting 10–100). +50 XP once a day.
- **Streak:** the number of consecutive reading days with ≥5 counted pages. Today shows as pending until it qualifies. A missed day resets the streak to 0. No streak freezes in v1. **Personal best** is the longest streak ever.

### 9.7 Trophies (v1 set)

| Id | Name | Rule | Scope |
|---|---|---|---|
| `first_page` | First Page | First counted page ever | Global |
| `week_one` | Week One | 7-day streak | Global |
| `month_of_pages` | Month of Pages | 30-day streak | Global |
| `marathon` | Marathon | 50 counted pages in one session | Global |
| `bookworm_1/2/3` | Bookworm I / II / III | Clear 1 / 5 / 20 books | Global |
| `stage_hunter` | Stage Hunter | Clear 25 stages | Global |
| `first_steps` | First Steps | Clear stage 1 of a book | Per book |
| `halfway` | Halfway There | 50 % of a book's pages counted | Per book |
| `cover_to_cover` | Cover to Cover | Clear the book | Per book |

Trophies are defined as data (`{ id, name, description, scope, icon, progress(state) → {current, target} }`), so new ones need no UI changes. "Next trophy" on Home = the unearned global trophy with the highest `current / target`.

### 9.8 Sessions

- A session starts when the reader opens. It ends on B, after 10 minutes suspended, or on quit. Active time follows the same idle cap as dwell.
- The session summary composes: counted pages, active time, XP events grouped by reason, level before and after, streak status, and trophies unlocked during the session.

---

## 10. Visual design system

**Rule: gold = earned or done (XP, cleared, rewards, the primary action). Cyan = here, now and focus (focus ring, current position, NEW, "you are here"). Never swap them.**

### 10.1 Colour tokens

| Token | Hex | Use |
|---|---|---|
| `bg.base` | `#0D1120` | App background |
| `bg.reader` | `#07090F` | Reader gutters |
| `bg.footer` | `#0A0E1A` | Prompt bar, tate bar |
| `surface.1` | `#161C31` | Cards, panels, inactive chips |
| `surface.tile` | `#181E34` | Session stat tiles, streak card |
| `surface.modal` | `#121729` | Session panel |
| `surface.inset` | `#10162A` | Callouts, current node fill |
| `surface.node` | `#1A2038` | Future stage nodes, cover placeholder |
| `surface.hexInner` | `#1E2238` | Inner part of outlined hexes |
| `surface.button2` | `#212946` / `#232B4A` | Secondary button / future week dots |
| `glyph.bg` | `#2B3354` | Button glyph fill |
| `glyph.ring` | `#333D66` | Glyph inside secondary button, secondary button border |
| `glyph.outline` | `#4A5478` | Back-grip / trackpad / stick glyph outline, position thumb |
| `line.1` | `#1D2440` | Header/footer borders |
| `line.2` | `#232B4A` | Card borders, dividers |
| `line.3` | `#2A3356` | Emphasised card borders |
| `line.4` | `#2C3558` | Chip borders, node borders |
| `track` | `#262E4E` | Empty progress |
| `text.primary` | `#EEF1F8` | Primary text |
| `text.secondary` | `#C5CBE0` | Prompt labels, body on dark |
| `text.muted` | `#A6AECB` | Secondary text |
| `text.dim` | `#8890AD` | Captions (≥4.5:1 on `bg.base` and `surface.1`) |
| `gold` | `#F5B947` | Rewards, cleared, primary action, active tab underline |
| `gold.on` | `#1A1405` | Text and icons on gold |
| `gold.deep` | `#9C7A35` | XP before the session in the level bar |
| `gold.border` | `#5B4A22` | Gold chip border, outer outlined hex, final stage segment |
| `gold.border2` | `#8A6A2C` | Trophy-unlocked card border |
| `gold.surface` | `#2A2312` | Gold chip / XP tile fill |
| `gold.surface2` | `#1E1A10` | Trophy-unlocked card fill |
| `gold.textSoft` | `#D9C08A` | Text on gold surfaces |
| `gold.toastBorder` | `#4A3E1C` | Toast border |
| `cyan` | `#58C7E6` | Focus, current position, NEW |
| `cyan.halo` | `rgba(88,199,230,0.14–0.20)` | Focus halo |
| `page.paper` / `page.sepia` / `page.night` | `#F4EEE1` / `#E9D9BC` / `#171A22` | Page themes (§8.7) |

### 10.2 Type

- **Chakra Petch** (500/600/700): headings, numbers, tabs, eyebrows (UPPERCASE, letter-spacing .08–.16em), glyph letters, chips, buttons.
- **Inter** (400–700): everything else in the UI.
- **Literata**: only for placeholder covers and the mock page content.
- **Sizes in use:** 44 (session title) · 34 (screen title) · 32 (hero title) · 28 (big percent) · 24 (panel title) · 22 (stage name) · 20 (stat value, XP toast) · 18 (card title, section heading) · 17 · 16 (tabs, buttons, author) · 15 (prompt labels, list rows) · 14 (meta) · 13 (captions, chips) · 12 (eyebrows, smallest captions). **Nothing essential below 12 px** on the 7" screen. Prefer ≥13 px for information people need.

### 10.3 Spacing, shape, depth

- Screen side padding 40. Header 76, footer 60. Gaps in use: 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30.
- **Radii:** panels 20–24, cards 18, tiles 14–16, covers 10 (8 for small), chips 18 (pill) or 8 (HUD), buttons 23 (pill, 46 px tall), progress 2–6.
- **Shadows:** cover `0 10px 24px rgba(0,0,0,.5)`, hero `0 24px 48px rgba(0,0,0,.45)`, modal `0 30px 80px rgba(0,0,0,.6)`.
- The only background atmosphere is a faint cyan radial glow behind Home's top area (`radial-gradient(ellipse 55% 100% at 28% 0%, rgba(88,199,230,.09), transparent 70%)`). No other gradients.
- **Hexes:** horizontal hex `clip-path: polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)`. Final-stage vertical hex `polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)`. An outlined hex is two nested hexes.

### 10.4 Components

| Component | Spec |
|---|---|
| **Glyph – face** (A/B/X/Y) | 28×28 circle, `glyph.bg`, letter in Chakra 700 14 px `#F2F4FA`. Inside a primary button it inverts: `gold.on` fill with a gold letter. Inside a secondary button the fill is `glyph.ring`. |
| **Glyph – shoulder** (L1/R1) | min 32×24, padding 0 6, radius `8 8 4 4`, Chakra 700 12 px |
| **Glyph – trigger** (L2/R2) | min 32×26, radius `11 11 4 4` |
| **Glyph – back grip** (L4/L5/R4/R5) | min 30–32×24, radius 6, 2 px `glyph.outline` border, transparent fill, Chakra 700 11 px |
| **Glyph – View / Menu** | 28 circle with a 14 px icon: two overlapping rounded squares / three lines |
| **Glyph – D-pad** | 28 circle with a filled 16 px plus |
| **Glyph – stick** (LS/RS) | 28 circle with an inner ring (`inset 0 0 0 5px glyph.bg, inset 0 0 0 7px glyph.outline`), 9 px label |
| **Glyph – trackpad** (LP/RP) | 30×28 rounded square, radius 7, 2 px outline, 9 px label |
| **PromptBar** | §7.0 |
| **Button – primary** | 46 px tall, radius 23, padding `0 22 0 9`, gold fill, `gold.on` text in Chakra 700 15–16 px .06em uppercase, an inverted face glyph on the left |
| **Button – secondary** | as primary, `surface.button2` fill, 1 px `glyph.ring` border, `text.primary` text |
| **Tabs, Chips** | §7.0, §7.2 |
| **SegmentedProgress** | segments (equal or weighted), gap 3–4, height 8–10, radius 2–3; states cleared/current(partial cyan)/future; optional final segment in `gold.border` |
| **HexBadge** | sizes 36×32, 42×38, 46×42, 56×50, 60×54; solid gold (earned) or outlined (target) or track (locked) |
| **Ring** | 64 px, stroke 7, round cap, starts at 12 o'clock |
| **WeekDots** | 24 px (Home) / 28 px (Summary) circles M–S; states qualified/today-pending/future-or-missed |
| **Cover** | §7.9 |
| **Toast** | §7.10 |
| **StatTile** | value in Chakra 700 (20 px small / 40 px large), label 12–13 px |

### 10.5 Motion

| What | Motion |
|---|---|
| Focus move | 120 ms ease-out (ring + lift) |
| HUD in/out | 150 ms fade + 8 px slide |
| Page turn | 120 ms slide (or Instant) |
| Column segment jump | 200 ms pan |
| Toast | in 250 ms, hold 4 s, out 200 ms |
| Session XP bar | 800 ms fill of the gained segment, starting 300 ms after the panel appears; stat numbers count up over the same 800 ms |
| Stage clear | the cleared node fills gold over 300 ms the next time the map is shown |

The **Reduce motion** setting replaces all of these with ≤80 ms fades.

### 10.6 Icons

Inline stroke SVGs, 1.8–2.4 px stroke, rounded joins: open book (logo), flame (streak), calendar-check (Week One), trophy (final stage), check, clock, two-column page, chevrons. No emoji anywhere.

---

## 11. Settings (defaults)

| Section | Setting | Default |
|---|---|---|
| Library | Folders | `~/Documents`, `~/Downloads`, SD cards (auto) |
| Library | Rescan on launch | On (incremental, by mtime + size) |
| Reading | Default fit | Auto (Column if two-column, Page if landscape page, else Width) |
| Reading | Gutters | Wide (110 px) |
| Reading | Auto-crop margins | On |
| Reading | Page theme | Paper (per-book override in the Display menu) |
| Reading | Page transition | Slide |
| Reading | Zen focus mode (hide counter/line) | Off |
| Reading | Tate hand | Left |
| Game | Game layer | Full / Light / Off → **Full** |
| Game | Daily goal | 25 pages |
| Game | XP model | Pages (word-weighted) |
| Controls | Back-grip key bindings | §6.5 |
| Controls | Haptics | On |
| Accessibility | Reduce motion | Off |
| Advanced | Dwell constants, idle cap, debug overlay | §9.2 / Off |

---

## 12. Performance and quality targets

- Cold start to an interactive Home: ≤2 s with a cached library.
- Page turn from cache: first frame ≤50 ms. Uncached: low-resolution frame ≤150 ms, full frame ≤400 ms on a dense page (measure on device and adjust).
- Smooth scrolling at the display's refresh rate at fit width. No layout work on scroll — just transform a cached bitmap.
- Memory budget: aim for ≤600 MB in total. The bitmap cache sizes itself to the screen.
- Battery: stop the animation loop when idle (§6.2). Generate thumbnails only while not reading, or throttled.
- Every state change persists within 1 s, and nothing is lost across suspend/resume or a hard power-off (use SQLite WAL).

---

## 13. Edge cases

Password-protected PDFs · corrupt or truncated files · very large PDFs (2,000+ pages, huge outlines → compact stage map) · mixed page sizes and rotated pages (fit per page; keep the zoom factor relative to fit) · landscape pages (slides) · a file moved or renamed (matched by `BookId` hash) · duplicates (same hash → one book, newest path) · SD card removed while reading (keep the page shown, toast "Card removed — progress saved", disable navigation outside the cache) · PDFs with no text layer (scans) · outlines pointing at invalid destinations (skip them) · stages of 0–1 pages (merge into neighbours) · system clock changes and timezone travel (day keys from local wall-clock time, never going backwards).

---

## 14. Testing

- **Unit (vitest), `core/`:** dwell and coverage, XP formulas, level curve, streak across the 04:00 boundary and DST, daily quest, stage derivation (outline / headings / even), stage and book clear rules, trophy progress, input mapping with simulated gamepad frames (repeat timing, deadzones, tate rotation), focus graphs.
- **Fixtures:** a public-domain book with an outline, a two-column paper with a full-width abstract, a scanned PDF with no text layer, a slide deck, a PDF without an outline. Column-detection tests assert gutter position and band ranges.
- **UI screenshots** (Playwright + Electron) at 1280×800, compared against `design/*.png` (Appendix B) for layout drift.
- **On-device checklist:**
  - Launches from Game Mode; Steam overlay over the app; suspend/resume mid-page; docked at 1080p; Steam Input layout bound as in §6.5.
  - All screens reachable without touch; no dead-end focus.
  - Tate-L and Tate-R input rotation; battery drain over 30 minutes of reading.

---

## 15. Milestones

1. **M0 — Shell:** Electron fullscreen with the scaling in §2; tokens; Glyph, PromptBar, Button; gamepad input layer with keyboard fallback; focus engine; debug overlay.
2. **M1 — Reader core:** open a PDF; Width and Page fit; page turns; scrolling; trigger zoom; right-stick pan; HUD; themes Paper/Sepia/Dim; position persistence; suspend handling.
3. **M2 — Library:** folder scan, DB, thumbnails; Home (hero + shelf, game cards stubbed); Library grid with filters and sort; Book details without the stage map; first-run folder picker.
4. **M3 — Stages and the game layer:** stage derivation; stage map (Book details + reader overlay); dwell and coverage; XP, levels, daily quest, streak; toasts; session summary; trophies; intensity setting.
5. **M4 — Papers:** auto-crop; column detection; Column mode; heading-based stages; the paper heuristic and Library callout.
6. **M5 — The rest:** tate mode; Settings; Search with the in-app keyboard; Collections; Trophies tab; Night theme; links and history.
7. **M6 — Ship on Deck:** AppImage (electron-builder); install notes; Steam Input layout doc (or file); Steam library artwork for the non-Steam shortcut (capsule, hero, logo); on-device QA (§14).

---

## 16. Open decisions

| # | Question | Default used in this spec |
|---|---|---|
| 1 | Runtime: standalone app (one Desktop Mode visit to add it to Steam) or Decky plugin (Game Mode only, more fragile)? | Standalone Electron (§3.1) |
| 2 | XP model: word-weighted pages or active reading time? | Word-weighted pages with dwell (§9.3) |
| 3 | Mostly papers or mostly books? This sets the default fit and what Home shows | Auto-detect per book; Home has one shelf |
| 4 | How much game by default: Full, or Light (stages + streak only)? | Full |
| 5 | Night mode for figure-heavy PDFs: Dim only, or invert with image protection (v2)? | Dim offered; invert is plain |
| 6 | Can a Steam Input layout ship for a non-Steam shortcut, or only be documented? | Documented; ship it if possible (§6.5) |
| 7 | Final app name | "Tome" (placeholder) |

---

## Appendix A — Fixture data from the mocks

Use these to seed a dev database so screens can be compared with the canvas. **The mock screens aren't one consistent timeline** (e.g. Home shows the state before the session in Session complete, but the page reached after it). Treat each screen's numbers as an independent fixture.

**Profile:** level 14, 1,240 / 2,000 XP; streak 6 days (Mon–Thu this week qualified, Friday pending); daily quest 7 / 25 pages.

**On the Origin of Species — Charles Darwin** (528 pages, 15 stages from the outline): page 96, 18 %; stage 5/15 = **IV Natural Selection**, p. 94–141 (48 pages), 3 counted; 4 h 12 m read, 9 sessions, 3 bookmarks (at about 5 %, 13 % and 31 % of the book), ~19 h left at the current pace; last session yesterday. Book trophies: First Steps (unlocked), Halfway There (18 / 50 %), Cover to Cover (locked; shown on the canvas as "Origin Story").
Stages: Intro · I Domestication · II Under Nature · III Struggle · IV Natural Selection · V Laws of Variation · VI Difficulties · VII Instinct · VIII Hybridism · IX Geological Record · X Succession · XI Distribution · XII Distribution, cont. · XIII Affinities · XIV Conclusion (final). Cleared: Intro–III.
HUD scrubber stage weights (relative page counts): 2, 4, 3, 3, 5, 5, 6, 5, 5, 6, 5, 6, 4, 7, 3.

**A review of sleep regulation in animals** (`review-sleep-regulation.pdf`, paper, 18 pages, two-column, 6 stages): stage 3/6 "Mechanisms", page 8, 42 %, 26 min read, 2 bookmarks, last read 3 days ago.

**Other books (progress):** Meditations — Marcus Aurelius (cleared) · The Art of War — Sun Tzu (64 %) · Frankenstein — Mary Shelley (23 %) · Moby-Dick — Herman Melville (7 %) · The Time Machine — H. G. Wells (new) · Alice's Adventures in Wonderland — Lewis Carroll (new) · Walden — Henry David Thoreau (0 %) · *Confocal imaging of live samples* (protocol, new). Library totals: 42 PDFs; Reading 6, Unread 21, Cleared 15, Papers 12.

**Session example:** Origin of Species p. 78 → 96; 18 counted pages; 24 min; XP +90 (pages) + 100 (stage III cleared) + 50 (daily quest 25/25) = **+240**; level 14 goes from 1,240 to 1,480 / 2,000 (520 to level 15); streak becomes 7 days (personal best); trophy unlocked: Week One. The HUD mock mid-session shows 16:40 elapsed, +12 pages, +160 XP, zoom 135 %, fit width, Paper theme.

---

## Appendix B — Artboard index

Canvas: https://claude.ai/artifact/SGo49C8kYSCGdK1xhm5hv2 — export each artboard as a PNG to `design/<name>.png`.

| Artboard | Size | Section |
|---|---|---|
| `Main` — Library home | 1280×800 | §7.1 |
| `LibraryGrid` — All books | 1280×800 | §7.2 |
| `BookDetails` — Stage map | 1280×800 | §7.3 |
| `Reader` — Focus mode | 1280×800 | §7.4 |
| `ReaderHUD` — HUD (A) | 1280×800 | §7.5 |
| `ReaderTate` — Tate mode | 800×1280 | §7.6 |
| `SessionComplete` | 1280×800 | §7.7 |
| `Controls` — Control map | 1280×800 | §6.3 |

The three reader artboards have a **pageTheme** tweak (Paper / Sepia / Night) for previewing themes.
