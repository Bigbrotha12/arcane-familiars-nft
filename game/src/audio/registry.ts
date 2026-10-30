// Audio asset registry. Files are intentionally not committed; run
// `scripts/fetch-audio-assets.sh` to populate `game/public/assets/audio/`.
// See `docs/AUDIO-PIPELINE.md` for sources, licenses, and download steps.

export const AUDIO_BASE = '/assets/audio';

export const MUSIC_TRACKS = {
  main: 'music/main.ogg',
  town: 'music/town.ogg',
  exploration: 'music/exploration.ogg',
  dungeon: 'music/dungeon.ogg',
  battle: 'music/battle.ogg',
  boss: 'music/boss.ogg',
  defeat: 'music/defeat.ogg',
} as const;

export type MusicTrack = keyof typeof MUSIC_TRACKS;

export const AMBIENCE_TRACKS = {
  forest: 'ambient/forest.ogg',
  cave: 'ambient/cave.ogg',
  interior: 'ambient/interior.ogg',
} as const;

export type AmbienceTrack = keyof typeof AMBIENCE_TRACKS;

export const SFX = {
  ui_click: 'sfx/ui_click.ogg',
  ui_confirm: 'sfx/ui_confirm.ogg',
  ui_cancel: 'sfx/ui_cancel.ogg',
  ui_error: 'sfx/ui_error.ogg',
  ui_hover: 'sfx/ui_hover.ogg',
  attack: 'sfx/attack.ogg',
  hit: 'sfx/hit.ogg',
  crit: 'sfx/crit.ogg',
  block: 'sfx/block.ogg',
  spell: 'sfx/spell.ogg',
  buff: 'sfx/buff.ogg',
  heal: 'sfx/heal.ogg',
  faint: 'sfx/faint.ogg',
  victory: 'sfx/level_up.ogg',
  level_up: 'sfx/level_up.ogg',
  loot: 'sfx/loot.ogg',
  coin: 'sfx/coin.ogg',
  encounter: 'sfx/encounter.ogg',
  door: 'sfx/door.ogg',
  footstep: 'sfx/footstep.ogg',
  flee: 'sfx/flee.ogg',
} as const;

export type SfxKey = keyof typeof SFX;

export function musicKey(id: MusicTrack): string {
  return `music_${id}`;
}

export function ambienceKey(id: AmbienceTrack): string {
  return `ambient_${id}`;
}

export function sfxKey(id: SfxKey): string {
  return `sfx_${id}`;
}

export function audioPath(relativePath: string): string {
  return `${AUDIO_BASE}/${relativePath}`;
}
