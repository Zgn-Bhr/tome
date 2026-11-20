# Steam Input layout for Tome

Standard gamepad input has no back grips or trackpads, so Tome listens for **keys** and **mouse events** that you bind in Steam Input (spec §6.5). Everything else (D-pad, sticks, A/B/X/Y, L1/R1, L2/R2, View, Menu, L3/R3) works with the default gamepad template.

> **Never bind** the Steam button or the Quick Access (⋯) button. They belong to SteamOS.

## Default bindings Tome expects

| Physical | Bind to | What it does in the reader (landscape) |
|---|---|---|
| **R4** | Keyboard **Page Down** | Next page |
| **L4** | Keyboard **Page Up** | Previous page |
| **R5** | Keyboard **]** | Next stage |
| **L5** | Keyboard **[** | Previous stage |
| **Right trackpad** | Mouse (*As Joystick Mouse* / *Mouse*) | Pointer: dragging pans, and clicking will follow links (M5) |
| **Left trackpad** | **Scroll Wheel** | Scrolls the page (with momentum from Steam) |

In tate (portrait) mode the prompts advertise the grips on the lower side: Tate-L shows **L4 next · L5 back**, Tate-R shows **R4 · R5** (tate arrives in M5).

## Setting it up (Game Mode) — verify on device

1. In the library, select **Tome** and press the **controller icon** (or **⋯ → Controller Settings** while it's running).
2. Choose **Edit Layout**. If the current template isn't gamepad-based, start from **Gamepad with Mouse Trackpad**.
3. **Back Grip Buttons:**
   - R4 → **Keyboard → Page Down**
   - L4 → **Keyboard → Page Up**
   - R5 → **Keyboard → ]**
   - L5 → **Keyboard → [**
4. **Trackpads:**
   - Right trackpad → **As Mouse** (usually the template default)
   - Left trackpad → **Scroll Wheel**
5. Back out to save. Optionally **Export Layout → Personal** so you can reapply it.

If you'd rather use other keys, bind those in Steam and then change them in Tome under **Menu → Settings → Back-grip keys**. The keys are shown there now; editing them in the app arrives with the full Settings screen (M5). Until then they can be changed in `~/.local/share/tome/settings.json` under `backGripKeys`.

## Shipping a layout (open question §16 #6)

The goal is for Tome to ship this layout so nobody has to bind keys by hand. Whether a layout can be exported, imported or installed by a script for a **non-Steam shortcut** still needs checking on a device. Until then, this page is the documented fallback.
