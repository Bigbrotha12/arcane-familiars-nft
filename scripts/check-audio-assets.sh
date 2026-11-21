#!/usr/bin/env bash
# Verify that the ignored audio assets needed by the game are present.
# Run `npm run audio:fetch` first.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIO="$ROOT/game/public/assets/audio"

required=(
  music/main.ogg
  music/town.ogg
  music/exploration.ogg
  music/dungeon.ogg
  music/battle.ogg
  music/boss.ogg
  music/defeat.ogg
  ambient/forest.ogg
  ambient/cave.ogg
  ambient/interior.ogg
  sfx/ui_click.ogg
  sfx/ui_confirm.ogg
  sfx/ui_cancel.ogg
  sfx/ui_error.ogg
  sfx/ui_hover.ogg
  sfx/attack.ogg
  sfx/hit.ogg
  sfx/crit.ogg
  sfx/block.ogg
  sfx/spell.ogg
  sfx/buff.ogg
  sfx/heal.ogg
  sfx/faint.ogg
  sfx/level_up.ogg
  sfx/loot.ogg
  sfx/coin.ogg
  sfx/encounter.ogg
  sfx/door.ogg
  sfx/footstep.ogg
  sfx/flee.ogg
)

missing=0
for file in "${required[@]}"; do
  if [[ ! -s "$AUDIO/$file" ]]; then
    echo "missing: game/public/assets/audio/$file"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "Run 'npm run audio:fetch' to populate the audio directory."
  exit 1
fi

echo "audio assets OK (${#required[@]} files)"
du -sh "$AUDIO"
