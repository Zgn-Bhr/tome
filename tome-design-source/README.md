# Tome — design source (reference only)

These are the HTML/CSS source files of the design canvas artboards, one per screen. Use them for **exact values** (colours, sizes, spacing, radii, font settings, layout). For the look, compare against the PNG exports in `design/`.

They are **not runnable as-is**: they were written for the canvas tool's own runtime.
- Ignore `<script src="./support.js">`, the `<x-dc>` / `<helmet>` wrappers and the `<script type="text/x-dc">` block at the bottom.
- `{{pageBg}}`, `{{ink}}`, `{{inkSoft}}` and `{{themeLabel}}` in the three reader files are placeholders for the page theme (Paper / Sepia / Night). Their values are in the script block at the bottom of each file and in §8.7 of the spec.
- Covers and page text are stand-ins. Real covers and pages come from the PDFs.
- The styles are all inline. Turn them into the tokens and components in §10 of `tome-design-spec.md` rather than copying them inline.

| File | Screen | Spec section |
|---|---|---|
| Main.dc.html | Library — Home | §7.1 |
| LibraryGrid.dc.html | Library — All books | §7.2 |
| BookDetails.dc.html | Book details + stage map | §7.3 |
| Reader.dc.html | Reader — focus mode | §7.4 |
| ReaderHUD.dc.html | Reader — HUD | §7.5 |
| ReaderTate.dc.html | Reader — tate mode (800×1280) | §7.6 |
| SessionComplete.dc.html | Session complete | §7.7 |
| Controls.dc.html | Control map | §6.3 |
