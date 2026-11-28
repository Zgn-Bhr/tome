#!/usr/bin/env bash
# Install or update Tome on a Steam Deck (or any x86_64 Linux) from GitHub.
#
#   curl -sL https://zgn-bhr.github.io/tome/install | bash
#
# (Same script as https://raw.githubusercontent.com/Zgn-Bhr/tome/main/scripts/install-deck.sh;
# the download page at https://zgn-bhr.github.io/tome/ serves a copy.)
#
# What it does:
#   1. Downloads the latest Tome AppImage from GitHub Releases
#   2. Installs it as ~/Applications/Tome.AppImage (same path on every update,
#      so the Steam shortcut keeps working)
#   3. Adds a menu entry with Tome's icon for Desktop Mode
#   4. On first install, adds Tome to Steam as a non-Steam game (needs Steam
#      running in Desktop Mode; skip with --no-steam), with its library artwork
#
# Options:
#   --version vX.Y.Z   install a specific release instead of the latest
#   --no-steam         don't add the Steam shortcut
#   --uninstall        remove the AppImage, icon and menu entry (your library data stays)

set -euo pipefail

REPO="Zgn-Bhr/tome"
ASSET="Tome-x86_64.AppImage"
APP_DIR="$HOME/Applications"
APP="$APP_DIR/Tome.AppImage"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP_FILE="$DATA_HOME/applications/tome.desktop"
ICON="$DATA_HOME/icons/hicolor/256x256/apps/tome.png"
# The first release whose AppImage has --export-icon and --steam-art.
JOBS_SINCE="v0.9.0"

version="latest"
add_to_steam=1
uninstall=0
while [ $# -gt 0 ]; do
  case "$1" in
    --version) version="${2:?--version needs a tag, e.g. v0.1.0}"; shift 2 ;;
    --no-steam) add_to_steam=0; shift ;;
    --uninstall) uninstall=1; shift ;;
    -h|--help) sed -n '2,21p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# True if version $1 is $2 or newer (both like v1.2.3).
version_ge() { [ "$(printf '%s\n%s\n' "${2#v}" "${1#v}" | sort -V | head -n1)" = "${2#v}" ]; }

# Runs one of Tome's command-line jobs. Quiet, and never stops the install.
tome_job() {
  if command -v timeout >/dev/null 2>&1; then timeout 60 "$APP" "$@" 2>/dev/null || true
  else "$APP" "$@" 2>/dev/null || true; fi
}

if [ "$uninstall" -eq 1 ]; then
  rm -f "$APP" "$DESKTOP_FILE" "$ICON"
  say "Removed Tome. Your library data is still in ~/.local/share/tome (delete it by hand if you want)."
  say "Remove the Steam shortcut from Steam itself: Manage → Remove non-Steam game from your library."
  exit 0
fi

if [ "$(uname -m)" != "x86_64" ]; then
  echo "Tome is built for x86_64 Linux (like the Steam Deck); this machine is $(uname -m)." >&2
  exit 1
fi

# Which release to install. For the latest, ask GitHub for its tag first, so the
# script knows what the AppImage can do.
if [ "$version" = "latest" ]; then
  tag="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null || true)"
  tag="${tag##*/}"
else
  tag="$version"
fi
case "$tag" in
  v[0-9]*) url="https://github.com/$REPO/releases/download/$tag/$ASSET" ;;
  *) tag=""; url="https://github.com/$REPO/releases/latest/download/$ASSET" ;;
esac
jobs=0
if [ -n "$tag" ] && version_ge "$tag" "$JOBS_SINCE"; then jobs=1; fi

first_install=1
[ -f "$APP" ] && first_install=0

mkdir -p "$APP_DIR" "$(dirname "$DESKTOP_FILE")"
tmp="$(mktemp "$APP_DIR/.Tome.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

say "Downloading $ASSET (${tag:-$version}) from github.com/$REPO"
curl -fL --progress-bar -o "$tmp" "$url"
chmod 755 "$tmp"
mv -f "$tmp" "$APP"
trap - EXIT
say "Installed $APP"

if [ "$jobs" -eq 1 ]; then tome_job --export-icon "$ICON" >/dev/null; fi

# The menu entry is also what Steam reads Tome's name and icon from.
case "$APP" in *" "*) exec_line="\"$APP\"" ;; *) exec_line="$APP" ;; esac
{
  echo "[Desktop Entry]"
  echo "Type=Application"
  echo "Name=Tome"
  echo "Comment=Controller-first PDF reader"
  echo "Exec=$exec_line"
  if [ -f "$ICON" ]; then echo "Icon=$ICON"; fi
  echo "Terminal=false"
  echo "Categories=Office;Viewer;"
} > "$DESKTOP_FILE"
say "Added a menu entry (Desktop Mode → Office → Tome)"

steam_art=0
if [ "$first_install" -eq 0 ]; then
  say "Updated. Your Steam shortcut and reading progress are unchanged."
  steam_art=1
elif [ "$add_to_steam" -eq 1 ]; then
  if command -v steamos-add-to-steam >/dev/null 2>&1 && pgrep -x steam >/dev/null 2>&1; then
    # Adding the menu entry (not the bare AppImage) gives the shortcut the name
    # "Tome" and the icon (verify on device).
    target="$APP"
    if [ -f "$ICON" ]; then target="$DESKTOP_FILE"; fi
    if steamos-add-to-steam "$target"; then
      say "Added Tome to Steam. Switch to Game Mode and look under Library → Non-Steam."
      steam_art=1
    fi
  else
    say "Add it to Steam by hand: Steam (Desktop Mode) → Games → Add a Non-Steam Game → Browse →"
    say "  pick $APP (set the file type filter to All Files)."
    say "Tome adds its library artwork itself the first time it starts from Steam."
  fi
fi

# Library artwork (capsule, wide capsule, hero, logo) for the Steam shortcut.
# Steam saves a new shortcut a moment after adding it, hence the wait.
if [ "$steam_art" -eq 1 ] && [ "$jobs" -eq 1 ]; then
  wait_sec=0
  if [ "$first_install" -eq 1 ]; then wait_sec=20; fi
  msg="$(tome_job --steam-art --wait "$wait_sec")"
  if [ -n "$msg" ]; then say "$msg"; fi
fi

say "Done. Bind the back grips in Steam Input: https://github.com/$REPO/blob/main/docs/steam-input-layout.md"
