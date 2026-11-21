import Phaser from 'phaser';
import { gameEventBus } from '../event-bus';
import { GameEvent, type UiSfxName } from '../events';
import {
  AMBIENCE_TRACKS,
  MUSIC_TRACKS,
  SFX,
  ambienceKey,
  audioPath,
  musicKey,
  sfxKey,
  type AmbienceTrack,
  type MusicTrack,
  type SfxKey,
} from './registry';

const STORAGE_MUTED = 'af_audio_muted';
const STORAGE_MUSIC_VOLUME = 'af_audio_music_volume';
const STORAGE_SFX_VOLUME = 'af_audio_sfx_volume';

const DEFAULT_MUSIC_VOLUME = 0.32;
const DEFAULT_AMBIENCE_VOLUME = 0.1;
const DEFAULT_SFX_VOLUME = 0.55;

interface PlayMusicOptions {
  fadeMs?: number;
}

interface PlaySfxOptions {
  volume?: number;
}

export interface AudioPreload {
  music?: MusicTrack[];
  ambience?: AmbienceTrack[];
  sfx?: SfxKey[];
}

type FadeTimer = ReturnType<typeof setInterval>;

type FadeableSound = Phaser.Sound.BaseSound & {
  volume: number;
  setVolume(value: number): Phaser.Sound.BaseSound;
};

/**
 * Global audio controller.
 *
 * Song/ambience channels survive Phaser scene transitions. Scene preloads only
 * load the tracks they need, so a first visit pays for that scene's audio rather
 * than the entire soundtrack. The actual files live outside git; see
 * `docs/AUDIO-PIPELINE.md` and `scripts/fetch-audio-assets.sh`.
 */
class AudioManager {
  private game?: Phaser.Game;
  private music?: FadeableSound;
  private ambience?: FadeableSound;
  private musicId?: MusicTrack;
  private ambienceId?: AmbienceTrack;
  private pendingMusic?: MusicTrack;
  private pendingAmbience?: AmbienceTrack;
  private fades = new Map<FadeableSound, FadeTimer>();
  private volumes = new Map<FadeableSound, number>();
  private muted = false;
  private musicVolume = DEFAULT_MUSIC_VOLUME;
  private sfxVolume = DEFAULT_SFX_VOLUME;
  private unlockArmed = false;
  private listening = false;

  attach(game: Phaser.Game): void {
    if (this.game === game) return;
    this.destroy();
    this.game = game;

    try {
      this.muted = localStorage.getItem(STORAGE_MUTED) === '1';
      const music = Number(localStorage.getItem(STORAGE_MUSIC_VOLUME));
      const sfx = Number(localStorage.getItem(STORAGE_SFX_VOLUME));
      if (Number.isFinite(music) && music > 0) this.musicVolume = Math.min(1, music);
      if (Number.isFinite(sfx) && sfx > 0) this.sfxVolume = Math.min(1, sfx);
    } catch {
      // localStorage can be unavailable in private/embedded contexts.
    }

    if (!this.listening) {
      gameEventBus.on(GameEvent.TOGGLE_MUTE, this.handleToggleMute);
      gameEventBus.on(GameEvent.UI_SFX, this.handleUiSfx);
      this.listening = true;
    }
    this.armUnlock();
    this.game.sound.on(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked);
  }

  preload(scene: Phaser.Scene, spec: AudioPreload): void {
    this.attach(scene.game);

    for (const id of spec.music ?? []) {
      const key = musicKey(id);
      if (!scene.cache.audio.exists(key)) {
        scene.load.audio(key, audioPath(MUSIC_TRACKS[id]));
      }
    }
    for (const id of spec.ambience ?? []) {
      const key = ambienceKey(id);
      if (!scene.cache.audio.exists(key)) {
        scene.load.audio(key, audioPath(AMBIENCE_TRACKS[id]));
      }
    }
    for (const id of spec.sfx ?? []) {
      const key = sfxKey(id);
      if (!scene.cache.audio.exists(key)) {
        scene.load.audio(key, audioPath(SFX[id]));
      }
    }
  }

  playMusic(id: MusicTrack, options: PlayMusicOptions = {}): void {
    if (!this.game) {
      this.pendingMusic = id;
      return;
    }
    if (this.musicId === id && this.music?.isPlaying) return;
    if (this.game.sound.locked) {
      this.pendingMusic = id;
      return;
    }

    const key = musicKey(id);
    if (!this.game.cache.audio.exists(key)) {
      this.pendingMusic = id;
      console.warn(`[audio] missing music "${id}" (${audioPath(MUSIC_TRACKS[id])})`);
      return;
    }

    this.pendingMusic = undefined;
    const previous = this.music;
    const next = this.game.sound.add(key, { loop: true }) as FadeableSound;
    if (!next.play()) {
      next.destroy();
      this.pendingMusic = id;
      return;
    }
    this.volumes.set(next, 0);
    this.setSoundVolume(next, 0);
    this.fadeTo(next, this.muted ? 0 : this.musicVolume, options.fadeMs ?? 900);

    if (previous && previous !== next) {
      this.fadeOutAndStop(previous, options.fadeMs ?? 650);
    }
    this.music = next;
    this.musicId = id;
  }

  stopMusic(fadeMs = 500): void {
    this.musicId = undefined;
    this.pendingMusic = undefined;
    if (this.music) {
      this.fadeOutAndStop(this.music, fadeMs);
      this.music = undefined;
    }
  }

  playAmbience(id: AmbienceTrack, options: PlayMusicOptions = {}): void {
    if (!this.game) {
      this.pendingAmbience = id;
      return;
    }
    if (this.ambienceId === id && this.ambience?.isPlaying) return;
    if (this.game.sound.locked) {
      this.pendingAmbience = id;
      return;
    }

    const key = ambienceKey(id);
    if (!this.game.cache.audio.exists(key)) {
      this.pendingAmbience = id;
      console.warn(`[audio] missing ambience "${id}" (${audioPath(AMBIENCE_TRACKS[id])})`);
      return;
    }

    this.pendingAmbience = undefined;
    const previous = this.ambience;
    const next = this.game.sound.add(key, { loop: true }) as FadeableSound;
    if (!next.play()) {
      next.destroy();
      this.pendingAmbience = id;
      return;
    }
    this.volumes.set(next, 0);
    this.setSoundVolume(next, 0);
    this.fadeTo(next, this.muted ? 0 : DEFAULT_AMBIENCE_VOLUME, options.fadeMs ?? 1000);

    if (previous && previous !== next) {
      this.fadeOutAndStop(previous, options.fadeMs ?? 700);
    }
    this.ambience = next;
    this.ambienceId = id;
  }

  stopAmbience(fadeMs = 500): void {
    this.ambienceId = undefined;
    this.pendingAmbience = undefined;
    if (this.ambience) {
      this.fadeOutAndStop(this.ambience, fadeMs);
      this.ambience = undefined;
    }
  }

  playSfx(id: SfxKey, options: PlaySfxOptions = {}): void {
    if (!this.game || this.muted || this.game.sound.locked) return;
    const key = sfxKey(id);
    if (!this.game.cache.audio.exists(key)) {
      console.warn(`[audio] missing sfx "${id}" (${audioPath(SFX[id])})`);
      return;
    }

    const volume = Math.max(0, Math.min(1, this.sfxVolume * (options.volume ?? 1)));
    const sound = this.game.sound.add(key);
    if (!sound.play()) {
      sound.destroy();
      return;
    }
    this.volumes.set(sound, volume);
    this.setSoundVolume(sound, volume);
    sound.once(Phaser.Sound.Events.COMPLETE, () => {
      this.volumes.delete(sound);
      sound.destroy();
    });
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_MUTED, muted ? '1' : '0');
    } catch {
      // ignore storage failures
    }
    if (this.music?.isPlaying) {
      this.fadeTo(this.music, muted ? 0 : this.musicVolume, 250);
    }
    if (this.ambience?.isPlaying) {
      this.fadeTo(this.ambience, muted ? 0 : DEFAULT_AMBIENCE_VOLUME, 250);
    }
  }

  private handleToggleMute = (): void => {
    this.toggleMute();
  };

  private handleUnlocked = (): void => {
    if (this.pendingMusic) {
      const id = this.pendingMusic;
      this.pendingMusic = undefined;
      this.playMusic(id);
    }
    if (this.pendingAmbience) {
      const id = this.pendingAmbience;
      this.pendingAmbience = undefined;
      this.playAmbience(id);
    }
  };

  private handleUiSfx = (payload: { sound?: UiSfxName }): void => {
    switch (payload?.sound) {
      case 'confirm':
        this.playSfx('ui_confirm');
        break;
      case 'cancel':
        this.playSfx('ui_cancel');
        break;
      case 'error':
        this.playSfx('ui_error');
        break;
      case 'hover':
        this.playSfx('ui_hover', { volume: 0.45 });
        break;
      case 'click':
      default:
        this.playSfx('ui_click');
        break;
    }
  };

  private armUnlock(): void {
    if (this.unlockArmed || typeof window === 'undefined') return;
    this.unlockArmed = true;

    const unlock = (): void => {
      try {
        this.game?.sound.unlock();
      } catch {
        // Sound manager may already be unlocked or unavailable.
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.unlockArmed = false;
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  private fadeTo(sound: FadeableSound, target: number, durationMs: number, onComplete?: () => void): void {
    const existing = this.fades.get(sound);
    if (existing) clearInterval(existing);

    const start = this.volumes.get(sound) ?? sound.volume;
    const clamped = Math.max(0, Math.min(1, target));
    if (durationMs <= 0 || Math.abs(start - clamped) < 0.001) {
      this.setSoundVolume(sound, clamped);
      onComplete?.();
      return;
    }

    const startAt = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - startAt) / durationMs);
      this.setSoundVolume(sound, start + (clamped - start) * t);
      if (t >= 1) {
        clearInterval(timer);
        this.fades.delete(sound);
        this.setSoundVolume(sound, clamped);
        onComplete?.();
      }
    }, 16);
    this.fades.set(sound, timer);
  }

  private setSoundVolume(sound: FadeableSound, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.volumes.set(sound, clamped);
    sound.setVolume(clamped);

    // Phaser's WebAudioSound schedules gain at time 0, which does not move the
    // live GainNode in browsers whose audio clock is already past 0. Re-schedule
    // at the current audio time so fades and SFX volumes take effect.
    if ('volumeNode' in sound) {
      const webAudio = sound as Phaser.Sound.WebAudioSound;
      const context = (webAudio.manager as Phaser.Sound.WebAudioSoundManager).context;
      const gain = webAudio.volumeNode.gain;
      gain.cancelScheduledValues(context.currentTime);
      gain.setValueAtTime(clamped, context.currentTime);
    }
  }

  private fadeOutAndStop(sound: FadeableSound, durationMs: number): void {
    this.fadeTo(sound, 0, durationMs, () => {
      try {
        sound.stop();
      } finally {
        this.volumes.delete(sound);
        sound.destroy();
      }
    });
  }

  destroy(): void {
    for (const timer of this.fades.values()) clearInterval(timer);
    this.fades.clear();
    this.volumes.clear();

    for (const sound of [this.music, this.ambience]) {
      if (!sound) continue;
      try {
        sound.stop();
        sound.destroy();
      } catch {
        // The underlying game may already be destroyed.
      }
    }
    this.music = undefined;
    this.ambience = undefined;
    this.musicId = undefined;
    this.ambienceId = undefined;
    this.pendingMusic = undefined;
    this.pendingAmbience = undefined;

    if (this.listening) {
      gameEventBus.off(GameEvent.TOGGLE_MUTE, this.handleToggleMute);
      gameEventBus.off(GameEvent.UI_SFX, this.handleUiSfx);
      this.listening = false;
    }
    this.game?.sound.off(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked);
    this.game = undefined;
    this.unlockArmed = false;
  }
}

export const audioManager = new AudioManager();
