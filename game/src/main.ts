import Phaser from 'phaser';
import { gameConfig } from './config';
import { audioManager } from './audio/manager';
import { computeCanvasSize } from './ui/viewport';

export function createGame(parentId: string): Phaser.Game {
  const parent = typeof document === 'undefined' ? null : document.getElementById(parentId);
  const { width, height } = computeCanvasSize(parent);
  const game = new Phaser.Game({
    ...gameConfig,
    // Render the 800x600 design space at the container's real pixel density so
    // canvas text and line work are not upscaled by CSS. Layout handles the
    // design-space mapping; Scale.FIT still sizes the canvas element.
    width,
    height,
    parent: parentId,
  });
  audioManager.attach(game);
  if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
    (window as any).__arcaneGame = game;
    (window as any).__arcaneAudio = audioManager;
  }
  return game;
}

export type PhaserGame = Phaser.Game;

// Standalone mode: auto-init only when loaded directly with ?standalone=true
// This prevents dual Phaser instances when the frontend dynamically imports this module
// after the React component has already rendered the #game-container element.
if (
  typeof window !== 'undefined' &&
  window.location.search.includes('standalone=true') &&
  document.getElementById('game-container')
) {
  createGame('game-container');
}
