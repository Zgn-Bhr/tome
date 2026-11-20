# Installing Tome on a Steam Deck

Tome runs as a **non-Steam game**. Adding it to Steam needs Desktop Mode **once**; after that it launches from the Game Mode library like any game (spec §3.1).

Steps marked **(verify on device)** come from general SteamOS knowledge and haven't been checked on real hardware yet.

## 1. Build the AppImage (on your Mac)

```bash
npm run dist:linux
```

The output is `dist/Tome-0.1.0-x86_64.AppImage`.

## 2. Copy it to the Deck

Any of these works:

- **USB stick or SD card:** copy the file over, then move it on the Deck in Dolphin (the file manager).
- **Network:** in Desktop Mode, set a password with `passwd` in Konsole and start SSH with `sudo systemctl start sshd`. Then, from the Mac:

  ```bash
  scp dist/Tome-0.1.0-x86_64.AppImage deck@steamdeck.local:~/Applications/
  ```

On the Deck, put it in `~/Applications/` and make it executable. In Dolphin: right-click → Properties → Permissions → *Is executable*. Or in Konsole:

```bash
chmod +x ~/Applications/Tome-0.1.0-x86_64.AppImage
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
