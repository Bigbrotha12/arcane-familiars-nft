import Phaser from 'phaser';
import { gameConfig } from '@/config';

export function createGame(parentId: string): Phaser.Game {
  return new Phaser.Game({
    ...gameConfig,
    parent: parentId,
  });
}

export function destroyGame(game: Phaser.Game): void {
  game.destroy(true);
}

// Standalone mode: auto-init when loaded directly (not imported by frontend)
if (typeof window !== 'undefined' && document.getElementById('game-container')) {
  createGame('game-container');
}
