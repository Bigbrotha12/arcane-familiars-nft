import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  private readonly TRANSITION_DELAY_MS = 800;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super({ key: 'BootScene' });
  }

  init(): void {
  }

  create(): void {
    const { width, height } = this.scale;

    const title = this.add.text(width / 2, height / 3, 'Arcane Familiars', {
      fontSize: '48px',
      fontFamily: 'Fredoka',
      fontStyle: '600',
      color: '#7C5CFC',
    });
    title.setOrigin(0.5);

    const loading = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '18px',
      fontFamily: 'DM Sans',
      color: '#A5A3C4',
    });
    loading.setOrigin(0.5);

    const timer = this.time.delayedCall(this.TRANSITION_DELAY_MS, () => {
      this.scene.start('WorldMapScene');
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
