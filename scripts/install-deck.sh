#!/usr/bin/env bash
# Install or update Tome on a Steam Deck (or any x86_64 Linux) from GitHub.
#
#   curl -fsSL https://raw.githubusercontent.com/Zgn-Bhr/tome/main/scripts/install-deck.sh | bash
#
# What it does:
#   1. Downloads the latest Tome AppImage from GitHub Releases
#   2. Installs it as ~/Applications/Tome.AppImage (same path on every update,
#      so the Steam shortcut keeps working)
#   3. Adds a menu entry for Desktop Mode
#   4. On first install, adds Tome to Steam as a non-Steam game (needs Steam
#      running in Desktop Mode; skip with --no-steam)
#
# Options:
#   --version vX.Y.Z   install a specific release instead of the latest
#   --no-steam         don't add the Steam shortcut
#   --uninstall        remove the AppImage and menu entry (your library data stays)

set -euo pipefail

REPO="Zgn-Bhr/tome"
ASSET="Tome-x86_64.AppImage"
APP_DIR="$HOME/Applications"
APP="$APP_DIR/Tome.AppImage"
DESKTOP_FILE="$HOME/.local/share/applications/tome.desktop"

version="latest"
add_to_steam=1
uninstall=0
while [ $# -gt 0 ]; do
  case "$1" in
    --version) version="${2:?--version needs a tag, e.g. v0.1.0}"; shift 2 ;;
    --no-steam) add_to_steam=0; shift ;;
    --uninstall) uninstall=1; shift ;;
    -h|--help) sed -n '2,19p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

if [ "$uninstall" -eq 1 ]; then
  rm -f "$APP" "$DESKTOP_FILE"
  say "Removed Tome. Your library data is still in ~/.local/share/tome (delete it by hand if you want)."
  say "Remove the Steam shortcut from Steam itself: Manage → Remove non-Steam game from your library."
  exit 0
fi

if [ "$(uname -m)" != "x86_64" ]; then
  echo "Tome is built for x86_64 Linux (like the Steam Deck); this machine is $(uname -m)." >&2
  exit 1
fi

if [ "$version" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/$ASSET"
else
  url="https://github.com/$REPO/releases/download/$version/$ASSET"
fi

first_install=1
[ -f "$APP" ] && first_install=0

mkdir -p "$APP_DIR" "$(dirname "$DESKTOP_FILE")"
tmp="$(mktemp "$APP_DIR/.Tome.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

say "Downloading $ASSET ($version) from github.com/$REPO"
curl -fL --progress-bar -o "$tmp" "$url"
chmod +x "$tmp"
mv -f "$tmp" "$APP"
trap - EXIT
say "Installed $APP"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Tome
Comment=Controller-first PDF reader
Exec="$APP" %U
Terminal=false
Categories=Office;Viewer;
EOF
say "Added a menu entry (Desktop Mode → Office → Tome)"

if [ "$first_install" -eq 0 ]; then
  say "Updated. Your Steam shortcut and reading progress are unchanged."
elif [ "$add_to_steam" -eq 1 ]; then
  if command -v steamos-add-to-steam >/dev/null 2>&1 && pgrep -x steam >/dev/null 2>&1; then
    steamos-add-to-steam "$APP" && say "Added Tome to Steam. Switch to Game Mode and look under Library → Non-Steam."
  else
    say "Add it to Steam by hand: Steam (Desktop Mode) → Games → Add a Non-Steam Game → Browse →"
    say "  pick $APP (set the file type filter to All Files)."
  fi
fi

say "Done. Bind the back grips in Steam Input: https://github.com/$REPO/blob/main/docs/steam-input-layout.md"
