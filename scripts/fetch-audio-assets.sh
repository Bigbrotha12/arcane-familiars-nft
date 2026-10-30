#!/usr/bin/env bash
#
# Fetch and prepare the game's audio assets.
#
# The resulting OGG files are deliberately gitignored. They live under
# game/public/assets/audio/ and are served by Vite in dev and copied into the
# build output. See docs/AUDIO-PIPELINE.md for sources, licenses, and manual
# fallback instructions.
#
# Prerequisites: curl, unzip, python3, ffmpeg (or set FFMPEG=/path/to/ffmpeg).
# Optional: AUDIO_CACHE_DIR=/path/to/cache (defaults to /tmp).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/game/public/assets/audio"
CACHE="${AUDIO_CACHE_DIR:-${TMPDIR:-/tmp}/arcane-familiars-audio}"
FFMPEG="${FFMPEG:-ffmpeg}"

CATTUS_PAGE="https://cattusvn.itch.io/a-heroic-journey-free-orchestra-rpg-music-pack"
CATTUS_UPLOAD_ID="16130898"
TOMMUSIC_PAGE="https://tommusic.itch.io/free-fantasy-200-sfx-pack"
TOMMUSIC_UPLOAD_ID="15588091"

CATTUS_ZIP="$CACHE/cattus.zip"
TOMMUSIC_ZIP="$CACHE/tommusic.zip"
KENNEY_UI_ZIP="$CACHE/kenney-interface-sounds.zip"
KENNEY_RPG_ZIP="$CACHE/kenney-rpg-audio.zip"

CATTUS="$CACHE/cattus/A Heroic Journey - Free Orchestral RPG Music Pack (+ Stems)"
TOMMUSIC="$CACHE/tommusic/Free Fantasy SFX Pack By TomMusic/OGG Files"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: missing '$1'. Install it or see docs/AUDIO-PIPELINE.md." >&2
    exit 1
  }
}

need curl
need unzip
need python3
command -v "$FFMPEG" >/dev/null 2>&1 || {
  echo "error: ffmpeg not found. Set FFMPEG=/path/to/ffmpeg or install ffmpeg." >&2
  exit 1
}

mkdir -p "$CACHE" "$OUT/music" "$OUT/ambient" "$OUT/sfx" "$OUT/licenses"

is_valid_zip() {
  [[ -s "$1" ]] && unzip -tq "$1" >/dev/null 2>&1
}

# itch.io "Download Now" pages expose a generated, short-lived S3 URL. Fetch the
# page for its CSRF token, then ask the upload endpoint for the signed URL.
fetch_itch_file() {
  local page="$1" upload_id="$2" out="$3" html csrf url
  if is_valid_zip "$out"; then
    echo "cache: $(basename "$out")"
    return
  fi

  html="$(mktemp)"
  echo "resolve: $page"
  curl -L --fail --silent --show-error --retry 3 --retry-delay 2 "$page" -o "$html"
  csrf="$(grep -oE 'name="csrf_token" value="[^"]+"' "$html" | sed 's/.*value="//;s/"//' | head -n1)"
  rm -f "$html"
  if [[ -z "$csrf" ]]; then
    echo "error: could not read itch.io CSRF token from $page" >&2
    exit 1
  fi

  url="$(curl -L --fail --silent --show-error --retry 3 --retry-delay 2 \
    -X POST "${page%/}/file/${upload_id}?source=view_game&as_props=1" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H 'X-Requested-With: XMLHttpRequest' \
    --data-urlencode "csrf_token=$csrf" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')"

  echo "download: $(basename "$out")"
  curl -L --fail --show-error --retry 3 --retry-delay 2 "$url" -o "$out"
  is_valid_zip "$out" || {
    echo "error: downloaded file is not a zip: $out" >&2
    exit 1
  }
}

fetch_url() {
  local url="$1" out="$2" referer="${3:-}"
  if is_valid_zip "$out"; then
    echo "cache: $(basename "$out")"
    return
  fi
  echo "download: $(basename "$out")"
  if [[ -n "$referer" ]]; then
    curl -L --fail --show-error --retry 3 --retry-delay 2 -A 'Mozilla/5.0' -e "$referer" "$url" -o "$out"
  else
    curl -L --fail --show-error --retry 3 --retry-delay 2 "$url" -o "$out"
  fi
  is_valid_zip "$out" || {
    echo "error: downloaded file is not a zip: $out" >&2
    exit 1
  }
}

fetch_itch_file "$CATTUS_PAGE" "$CATTUS_UPLOAD_ID" "$CATTUS_ZIP"
fetch_itch_file "$TOMMUSIC_PAGE" "$TOMMUSIC_UPLOAD_ID" "$TOMMUSIC_ZIP"
fetch_url \
  'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip' \
  "$KENNEY_UI_ZIP" \
  'https://kenney.nl/assets/interface-sounds'
fetch_url \
  'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip' \
  "$KENNEY_RPG_ZIP" \
  'https://kenney.nl/assets/rpg-audio'

for dir in "$CACHE/cattus" "$CACHE/tommusic" "$CACHE/kenney-ui" "$CACHE/kenney-rpg"; do
  rm -rf "$dir"
done
unzip -q "$CATTUS_ZIP" -d "$CACHE/cattus"
unzip -q "$TOMMUSIC_ZIP" -d "$CACHE/tommusic"
unzip -q "$KENNEY_UI_ZIP" -d "$CACHE/kenney-ui"
unzip -q "$KENNEY_RPG_ZIP" -d "$CACHE/kenney-rpg"

convert_music() {
  local src="$1" dst="$2" quality="${3:-5}"
  echo "convert: $(basename "$dst")"
  "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -vn -c:a libvorbis -q:a "$quality" -ar 44100 "$dst"
}

convert_music "$CATTUS/1. Main theme (Peace of a Journey).wav" "$OUT/music/main.ogg"
convert_music "$CATTUS/2. Town theme (Streets of the Common).wav" "$OUT/music/town.ogg"
convert_music "$CATTUS/3. Exploration Theme (Off the Horizon).wav" "$OUT/music/exploration.ogg"
convert_music "$CATTUS/4. Dungeon Theme (Unknown Echoes).wav" "$OUT/music/dungeon.ogg"
convert_music "$CATTUS/5. Normal Battle Theme (Familiar Obstacles).wav" "$OUT/music/battle.ogg"
convert_music "$CATTUS/6. Boss Battle Theme (Great Conquerors).wav" "$OUT/music/boss.ogg"
convert_music "$CATTUS/7. Emotional Theme (Sentimental Wishes).wav" "$OUT/music/defeat.ogg"

convert_music "$CATTUS/Short Cues/Death Sounds - Failed Steps.wav" "$OUT/sfx/faint.ogg" 4
convert_music "$CATTUS/Short Cues/Level Up & Quest Completed - Succesful Tromebone.wav" "$OUT/sfx/level_up.ogg" 4

copy_file() {
  local src="$1" dst="$2"
  [[ -f "$src" ]] || {
    echo "error: missing source: $src" >&2
    exit 1
  }
  install -m 0644 "$src" "$dst"
}

# TomMusic combat, loot, movement, and ambience (already OGG).
copy_file "$TOMMUSIC/SFX/Attacks/Sword Attacks Hits and Blocks/Sword Attack 1.ogg" "$OUT/sfx/attack.ogg"
copy_file "$TOMMUSIC/SFX/Attacks/Sword Attacks Hits and Blocks/Sword Impact Hit 1.ogg" "$OUT/sfx/hit.ogg"
copy_file "$TOMMUSIC/SFX/Attacks/Sword Attacks Hits and Blocks/Sword Impact Hit 3.ogg" "$OUT/sfx/crit.ogg"
copy_file "$TOMMUSIC/SFX/Attacks/Sword Attacks Hits and Blocks/Sword Blocked 1.ogg" "$OUT/sfx/block.ogg"
copy_file "$TOMMUSIC/SFX/Spells/Spell Impact 1.ogg" "$OUT/sfx/spell.ogg"
copy_file "$TOMMUSIC/SFX/Spells/Firebuff 1.ogg" "$OUT/sfx/buff.ogg"
copy_file "$TOMMUSIC/SFX/Spells/Spell Impact 3.ogg" "$OUT/sfx/encounter.ogg"
copy_file "$TOMMUSIC/SFX/Doors Gates and Chests/Chest Open 1.ogg" "$OUT/sfx/loot.ogg"
copy_file "$TOMMUSIC/SFX/Doors Gates and Chests/Door Open 1.ogg" "$OUT/sfx/door.ogg"
copy_file "$TOMMUSIC/SFX/Footsteps/Stone/Stone Walk 1.ogg" "$OUT/sfx/footstep.ogg"
copy_file "$TOMMUSIC/SFX/Footsteps/Dirt/Dirt Run 1.ogg" "$OUT/sfx/flee.ogg"

copy_file "$TOMMUSIC/BGS Loops/Forest Day/Forest Day.ogg" "$OUT/ambient/forest.ogg"
copy_file "$TOMMUSIC/BGS Loops/Cave/Cave.ogg" "$OUT/ambient/cave.ogg"
copy_file "$TOMMUSIC/BGS Loops/Interior Day/Inside Day.ogg" "$OUT/ambient/interior.ogg"

# Kenney UI and RPG audio (CC0).
copy_file "$CACHE/kenney-ui/Audio/click_001.ogg" "$OUT/sfx/ui_click.ogg"
copy_file "$CACHE/kenney-ui/Audio/confirmation_001.ogg" "$OUT/sfx/ui_confirm.ogg"
copy_file "$CACHE/kenney-ui/Audio/back_001.ogg" "$OUT/sfx/ui_cancel.ogg"
copy_file "$CACHE/kenney-ui/Audio/error_004.ogg" "$OUT/sfx/ui_error.ogg"
copy_file "$CACHE/kenney-ui/Audio/select_001.ogg" "$OUT/sfx/ui_hover.ogg"
copy_file "$CACHE/kenney-ui/Audio/confirmation_002.ogg" "$OUT/sfx/heal.ogg"
copy_file "$CACHE/kenney-rpg/Audio/handleCoins.ogg" "$OUT/sfx/coin.ogg"

# Keep local copies of the license text next to the ignored assets.
copy_file "$CATTUS/README_LICENSE.txt" "$OUT/licenses/cattus-LICENSE.txt"
copy_file "$CACHE/tommusic/Free Fantasy SFX Pack By TomMusic/ReadMe.txt" "$OUT/licenses/tommusic-README.txt"
copy_file "$CACHE/kenney-ui/License.txt" "$OUT/licenses/kenney-interface-sounds-LICENSE.txt"
copy_file "$CACHE/kenney-rpg/License.txt" "$OUT/licenses/kenney-rpg-audio-LICENSE.txt"

cat > "$OUT/SOURCE.txt" <<'TXT'
Arcane Familiars audio assets
Generated by scripts/fetch-audio-assets.sh. Do not commit this directory.

Music: A Heroic Journey by cattus
  https://cattusvn.itch.io/a-heroic-journey-free-orchestra-rpg-music-pack
  Royalty-free; commercial use allowed; credit appreciated.

SFX and ambience: Free Fantasy 200 SFX Pack by TomMusic
  https://tommusic.itch.io/free-fantasy-200-sfx-pack
  Royalty-free; commercial use allowed; credit appreciated; do not resell/redistribute.

UI SFX: Kenney Interface Sounds
  https://kenney.nl/assets/interface-sounds
  CC0 1.0.

Coin SFX: Kenney RPG Audio
  https://kenney.nl/assets/rpg-audio
  CC0 1.0.
TXT

echo
echo "audio ready: $OUT"
du -sh "$OUT"
echo "run 'npm run audio:check' to verify the expected file set."
