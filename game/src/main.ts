import Phaser from 'phaser';
import { gameConfig } from './config';

export function createGame(parentId: string): Phaser.Game {
  return new Phaser.Game({
    ...gameConfig,
    parent: parentId,
  });
}

export function destroyGame(game: Phaser.Game): void {
  game.destroy(true);
}

export type PhaserGame = Phaser.Game

// Standalone mode: auto-init only when loaded directly with ?standalone=true
// This prevents dual Phaser instances when the frontend dynamically imports this module
// after the React component has already rendered the #game-container element.
if (typeof window !== 'undefined' && window.location.search.includes('standalone=true') && document.getElementById('game-container')) {
  createGame('game-container');
}
