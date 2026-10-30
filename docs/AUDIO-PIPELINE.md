# Audio Pipeline

The game uses three free audio packs. Their files are **not committed** because
they total roughly 900 MB uncompressed (26 MB after preparation). Only this
document and the fetch/check scripts are tracked.

## Quick start

Prerequisites: `curl`, `unzip`, `python3`, and `ffmpeg`.

```bash
npm run audio:fetch
npm run audio:check
npm run dev
```

If `ffmpeg` is not installed, use a static build without touching the system:

```bash
mkdir -p /tmp/ffmpeg-static
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
  | tar -xJ -C /tmp/ffmpeg-static --strip-components=1
FFMPEG=/tmp/ffmpeg-static/ffmpeg npm run audio:fetch
```

The script caches the large source zips in
`${AUDIO_CACHE_DIR:-${TMPDIR:-/tmp}/arcane-familiars-audio}`. Delete that cache
if you want to re-download from scratch.

## Files

Output lives under `game/public/assets/audio/`, which is gitignored:

```text
game/public/assets/audio/
├── music/
│   ├── main.ogg
│   ├── town.ogg
│   ├── exploration.ogg
│   ├── dungeon.ogg
│   ├── battle.ogg
│   ├── boss.ogg
│   └── defeat.ogg
├── ambient/
│   ├── forest.ogg
│   ├── cave.ogg
│   └── interior.ogg
├── sfx/
│   ├── ui_*.ogg
│   ├── attack.ogg, hit.ogg, crit.ogg, block.ogg
│   ├── spell.ogg, buff.ogg, heal.ogg, faint.ogg
│   ├── loot.ogg, coin.ogg, level_up.ogg
│   └── encounter.ogg, door.ogg, footstep.ogg, flee.ogg
└── licenses/
```

`frontend/public/assets` is a symlink to `game/public/assets`, so both dev
servers see the same files.

## Sources and licenses

### Music — A Heroic Journey by cattus

- Source: https://cattusvn.itch.io/a-heroic-journey-free-orchestra-rpg-music-pack
- License: royalty-free, free and commercial projects, credit appreciated.
- Attribution: `Music by cattus`.
- Do not resell/redistribute the raw tracks or register them with Content ID.
- Tracks used: Main, Town, Exploration, Dungeon, Normal Battle, Boss Battle,
  Emotional/Defeat. The pack's short cues supply `level_up.ogg` and `faint.ogg`.

### SFX and ambience — Free Fantasy 200 SFX Pack by TomMusic

- Source: https://tommusic.itch.io/free-fantasy-200-sfx-pack
- License: royalty-free, commercial projects, credit appreciated.
- Do not resell/redistribute the raw files.
- Used for combat, spells, chests, doors, footsteps, fleeing, and forest/cave/
  interior ambience loops.

### UI SFX — Kenney Interface Sounds

- Source: https://kenney.nl/assets/interface-sounds
- License: CC0 1.0 (no attribution required).
- Used for click, confirm, cancel, error, hover, and heal chimes.

### Coin SFX — Kenney RPG Audio

- Source: https://kenney.nl/assets/rpg-audio
- License: CC0 1.0.
- Used for shop purchases.

The fetch script writes copies of each pack's license/readme into the ignored
`licenses/` folder. Keep those with the local assets, and keep this document in
the repo as the durable attribution record.

## Scene mapping

| Scene | Music | Ambience |
| --- | --- | --- |
| Boot / World Map / Party Select | `main` | — |
| Shop | `town` | `interior` |
| Exploration (Verdant, Shadow, Ember, Frost) | `exploration` | `forest` (Verdant/Shadow) or `cave` (Ember/Frost) |
| Exploration (Crystal Caves, Sunken Archive) | `dungeon` | `cave` |
| Normal battle | `battle` | — |
| Boss battle | `boss` | — |
| Defeat / forfeit | `defeat` | — |

Music crossfades between scenes. Ambience is a separate low-volume loop.

## Runtime controls

- Music and ambience are global Phaser sounds, so they survive scene changes.
- The toolbar has a mute toggle; the setting persists in `af_audio_muted`.
- Browser autoplay is handled by arming the Phaser sound manager on the first
  pointer/keyboard gesture.
- Missing files log one warning and leave the game silent rather than crashing.
  Run `npm run audio:check` before a build to catch gaps.

## Manual fallback

If an itch.io upload ID changes, download the packs manually and run the same
conversion/copy steps:

1. Download the three packs from the links above.
2. Extract them into a temporary directory.
3. Convert the seven Cattus WAV tracks to OGG Vorbis (quality ~5) and the two
   short cues (quality ~4).
4. Copy the TomMusic OGG files listed in `scripts/fetch-audio-assets.sh`.
5. Copy the Kenney files listed in the script.
6. Run `npm run audio:check`.

The upload IDs are at the top of `scripts/fetch-audio-assets.sh`. If the script
fails on the `download_url` step, the page layout or upload ID changed; download
manually from the pack pages instead.

## Deployment note

Because audio is gitignored, CI does not have it automatically. Before building
a deployable frontend, run `npm run audio:fetch` in the build environment (or
restore the same `game/public/assets/audio/` tree from an artifact/R2 bucket).
A build without audio still runs, but music/SFX are silent and the browser
console shows missing-file warnings.

## Attribution copy

Add to the in-game credits and store page:

```text
Music: "A Heroic Journey" by cattus
SFX: Free Fantasy 200 SFX Pack by TomMusic
UI SFX: Kenney Interface Sounds (CC0)
Coin SFX: Kenney RPG Audio (CC0)
```
