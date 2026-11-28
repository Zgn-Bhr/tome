# Installing Tome on a Steam Deck

Tome runs as a **non-Steam game**. Adding it to Steam needs Desktop Mode **once**; after that it launches from the Game Mode library like any game (spec §3.1).

Steps marked **(verify on device)** come from general SteamOS knowledge and haven't been checked on real hardware yet.

## Quick install (recommended)

The easiest way is the download page, **https://zgn-bhr.github.io/tome/**: a Download button plus point-and-click steps. Or use the one-line command:

1. On the Deck, switch to **Desktop Mode** (Steam button → Power → Switch to Desktop).
2. Open **Konsole** (application menu → System → Konsole).
3. Paste this and press Enter (Ctrl+Shift+V pastes in Konsole):

   ```bash
   curl -sL https://zgn-bhr.github.io/tome/install | bash
   ```

   It downloads the latest release into `~/Applications/Tome.AppImage` and adds a menu entry with Tome's icon. On first install, it also adds Tome to Steam with SteamOS's `steamos-add-to-steam`, named "Tome" and with its icon, and puts Tome's library artwork on the shortcut (verify on device). If that helper isn't found, it tells you how to add Tome by hand (step 3 below).
4. Switch back to Game Mode. Tome is under **Library → Non-Steam**, with its artwork.

**Update** without leaving Game Mode (from v0.7.0): Tome checks GitHub once a day and shows **Update available** when there's a new version. Open **☰ (Menu) → Software update** and press A to install it (it downloads in the background and checks the file against the checksum GitHub publishes), then A again on **Restart now**, or just start Tome next time. Turn off **Check for updates automatically** to stop the daily check; **Software update** still checks when you press A. Running the same command again also updates. Either way, the Steam shortcut and your progress stay as they are. Other options:

```bash
curl -sL https://zgn-bhr.github.io/tome/install | bash -s -- --version v0.1.0
```
```bash
curl -sL https://zgn-bhr.github.io/tome/install | bash -s -- --uninstall
```

If you'd rather read the script before running it:

```bash
curl -sL -o install-deck.sh https://zgn-bhr.github.io/tome/install
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

Optional: right-click the new entry → **Properties** to rename it "Tome" and pick an icon (`~/.local/share/icons/hicolor/256x256/apps/tome.png` after the install command, or any PNG).

## Steam library artwork

Tome brings its own capsule, wide capsule, hero and logo, and puts them on its Steam shortcut itself, so there's nothing to set by hand:

- The install command adds them right after it adds Tome to Steam, so they're there the first time you switch to Game Mode.
- Tome also adds them a few seconds after it starts, if they're missing. This covers shortcuts added by hand and installs from before v0.9.0. Steam only reads artwork when it starts, so images added while Steam is running appear after the next restart (switch to Desktop Mode and back, or reboot).
- Only empty slots are filled. Art you set yourself, for example from SteamGridDB, is never replaced. If you clear Tome's art in Steam, it doesn't come back: Tome adds it once per shortcut.
- The files go into `~/.local/share/Steam/userdata/<your Steam ID>/config/grid/`, named after the shortcut's ID. Tome finds that ID by reading Steam's shortcut list (`shortcuts.vdf`) and never changes that list.

The **icon** lives inside the shortcut itself, so Tome can't set it on an existing shortcut. New installs get it from the menu entry. To set it on an older shortcut, in Desktop Mode: right-click Tome → **Properties** → click the empty square next to the name and pick `~/.local/share/icons/hicolor/256x256/apps/tome.png` (run the install command once to put it there).

To set the artwork yourself instead, in Desktop Mode: right-click Tome in the library grid → **Manage → Set custom artwork** for the capsule, and right-click the banner on its page for **Set custom background** (hero) and **Set custom logo**. The images are in [`resources/steam/`](../resources/steam/).

## 4. Play in Game Mode

Return to Game Mode. Tome is under **Library → Non-Steam**.

- On first launch it scans `~/Documents`, `~/Downloads` and any SD card under `/run/media/…` (verify on device). If it finds no PDFs, it opens the in-app folder picker.
- To add more folders later: **☰ (Menu) → Library folders**.
- **Game manuals from ES-DE** (EmuDeck, RetroDECK) are picked up from `downloaded_media/<system>/manuals/`, including `~/ES-DE`, `~/Emulation/tools` and `~/retrodeck`. They get a shelf per system in **Collections** and a **Manuals** filter in the Library. To leave them out, turn off **☰ (Menu) → Game manuals (ES-DE)**: they're hidden at once and no longer scanned.
- Tome detects Game Mode (gamescope) and goes fullscreen (verify on device which environment variables gamescope sets). It's also forced fullscreen with the `--fullscreen` launch option.

## 5. Controls

The D-pad, sticks, face buttons, shoulders and triggers work out of the box through Steam Input's virtual gamepad. The **back grips (L4/L5/R4/R5) and the trackpads** need bindings in the Steam Input layout: see [steam-input-layout.md](steam-input-layout.md).

## Where things are stored

`~/.local/share/tome/` holds `tome.db` (SQLite, WAL), `settings.json`, `update.json` (when updates were last checked), `steam-art.json` (which Steam shortcuts already got Tome's artwork) and `thumbs/`. Your PDFs are never moved or changed.

## Troubleshooting (verify on device)

| Symptom | Try |
|---|---|
| Won't start: a sandbox / `chrome-sandbox` error | Add the launch option `--no-sandbox` (Properties → Launch options). |
| Black or blank window in Game Mode | Launch option `--ozone-platform=x11`; if that doesn't help, also `--disable-gpu`. |
| Controller does nothing | Press any button once (browsers only expose a gamepad after its first input). Then turn on **Menu → Debug overlay**, which lists the gamepads Tome sees. |
| Back grips do nothing | Bind them to keys in the Steam Input layout ([steam-input-layout.md](steam-input-layout.md)). |
| Update says "Can't write next to the AppImage" | The folder holding the AppImage must be writable; move it to `~/Applications` (or reinstall with the command above). |
| After **Restart now**, Tome doesn't come back | Start it again from the Library; the new version is already installed. |
| No artwork on the Steam shortcut | Start Tome once, then restart Steam (switch to Desktop Mode and back). If it's still missing, run `~/Applications/Tome.AppImage --steam-art` in Konsole: it says what it found. Delete `~/.local/share/tome/steam-art.json` first if you cleared the art earlier and want it back. |
| Wrong position after suspend | Report it with the page you were on. Position is saved on every page change, every 10 s and on suspend. |
