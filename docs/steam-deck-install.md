# Installing Tome on a Steam Deck

Tome runs as a **non-Steam game**. Adding it to Steam needs Desktop Mode **once**; after that it launches from the Game Mode library like any game (spec §3.1).

Steps marked **(verify on device)** come from general SteamOS knowledge and haven't been checked on real hardware yet.

## Quick install from GitHub (recommended)

1. On the Deck, switch to **Desktop Mode** (Steam button → Power → Switch to Desktop).
2. Open **Konsole** (application menu → System → Konsole).
3. Paste this and press Enter (Ctrl+Shift+V pastes in Konsole):

   ```bash
   curl -fsSL https://raw.githubusercontent.com/Zgn-Bhr/tome/main/scripts/install-deck.sh | bash
   ```

   It downloads the latest release into `~/Applications/Tome.AppImage`, adds a menu entry and, on first install, adds Tome to Steam with SteamOS's `steamos-add-to-steam` (verify on device). If that helper isn't found, it tells you how to add Tome by hand (step 3 below).
4. Switch back to Game Mode. Tome is under **Library → Non-Steam**.

**Update** later by running the same command; the Steam shortcut and your progress stay as they are. Other options:

```bash
curl -fsSL https://raw.githubusercontent.com/Zgn-Bhr/tome/main/scripts/install-deck.sh | bash -s -- --version v0.1.0
```
```bash
curl -fsSL https://raw.githubusercontent.com/Zgn-Bhr/tome/main/scripts/install-deck.sh | bash -s -- --uninstall
```

If you'd rather read the script before running it:

```bash
curl -fsSLO https://raw.githubusercontent.com/Zgn-Bhr/tome/main/scripts/install-deck.sh
```
```bash
less install-deck.sh
```
```bash
bash install-deck.sh
```

The rest of this page is the manual route.

## 1. Build the AppImage (on your Mac)

```bash
npm run dist:linux
```

The output is `dist/Tome-x86_64.AppImage`. Releases on GitHub carry the same file.

## 2. Copy it to the Deck

Any of these works:

- **GitHub release:** download `Tome-x86_64.AppImage` from the repo's Releases page in the Deck's browser.
- **USB stick or SD card:** copy the file over, then move it on the Deck in Dolphin (the file manager).
- **Network:** in Desktop Mode, set a password with `passwd` in Konsole and start SSH with `sudo systemctl start sshd`. Then, from the Mac:

  ```bash
  scp dist/Tome-x86_64.AppImage deck@steamdeck.local:~/Applications/Tome.AppImage
  ```

On the Deck, put it in `~/Applications/` and make it executable. In Dolphin: right-click → Properties → Permissions → *Is executable*. Or in Konsole:

```bash
chmod +x ~/Applications/Tome.AppImage
```

## 3. Add it to Steam (Desktop Mode, once)

1. Open Steam in Desktop Mode.
2. **Games → Add a Non-Steam Game to My Library… → Browse…**
3. Change the file type filter to **All Files**, then pick the AppImage.
4. Click **Add Selected Programs**.

Optional: right-click the new entry → **Properties** to rename it "Tome" and set artwork (capsule, hero and logo are planned for M6).

## 4. Play in Game Mode

Return to Game Mode. Tome is under **Library → Non-Steam**.

- On first launch it scans `~/Documents`, `~/Downloads` and any SD card under `/run/media/…` (verify on device). If it finds no PDFs, it opens the in-app folder picker.
- To add more folders later: **☰ (Menu) → Library folders**.
- Tome detects Game Mode (gamescope) and goes fullscreen (verify on device which environment variables gamescope sets). It's also forced fullscreen with the `--fullscreen` launch option.

## 5. Controls

The D-pad, sticks, face buttons, shoulders and triggers work out of the box through Steam Input's virtual gamepad. The **back grips (L4/L5/R4/R5) and the trackpads** need bindings in the Steam Input layout: see [steam-input-layout.md](steam-input-layout.md).

## Where things are stored

`~/.local/share/tome/` holds `tome.db` (SQLite, WAL), `settings.json` and `thumbs/`. Your PDFs are never moved or changed.

## Troubleshooting (verify on device)

| Symptom | Try |
|---|---|
| Won't start: a sandbox / `chrome-sandbox` error | Add the launch option `--no-sandbox` (Properties → Launch options). |
| Black or blank window in Game Mode | Launch option `--ozone-platform=x11`; if that doesn't help, also `--disable-gpu`. |
| Controller does nothing | Press any button once (browsers only expose a gamepad after its first input). Then turn on **Menu → Debug overlay**, which lists the gamepads Tome sees. |
| Back grips do nothing | Bind them to keys in the Steam Input layout ([steam-input-layout.md](steam-input-layout.md)). |
| Wrong position after suspend | Report it with the page you were on. Position is saved on every page change, every 10 s and on suspend. |
