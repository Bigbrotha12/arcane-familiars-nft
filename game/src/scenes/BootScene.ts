import Phaser from 'phaser';
import { Layout } from '../ui/layout';
import { SCENE_KEYS } from '../constants/scenes';

export class BootScene extends Phaser.Scene {
  private readonly TRANSITION_DELAY_MS = 800;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super({ key: 'BootScene' });
  }

  init(): void {}

  create(): void {
    const { width, height } = this.scale;
    const layout = new Layout(this);

    const title = this.add.text(width / 2, height / 3, 'Arcane Familiars', {
      fontSize: layout.font(48),
      fontFamily: 'Fredoka',
      fontStyle: '600',
      color: '#7C5CFC',
    });
    title.setOrigin(0.5);

    const loading = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: layout.font(18),
      fontFamily: 'DM Sans',
      color: '#A5A3C4',
    });
    loading.setOrigin(0.5);

    const timer = this.time.delayedCall(this.TRANSITION_DELAY_MS, () => {
      this.scene.start(SCENE_KEYS.WORLD_MAP);
    });
    this.timers.push(timer);

    this.events.on('shutdown', this.cleanupTimers, this);
  }

  private cleanupTimers(): void {
    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];
  }
}
