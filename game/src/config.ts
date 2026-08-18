import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';
import { ExplorationScene } from './scenes/ExplorationScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { PartySelectScene } from './scenes/PartySelectScene';
import { DungeonFailScene } from './scenes/DungeonFailScene';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './ui/layout';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: typeof window !== 'undefined' ? Math.floor(window.innerWidth * window.devicePixelRatio) : DESIGN_WIDTH,
  height: typeof window !== 'undefined' ? Math.floor(window.innerHeight * window.devicePixelRatio) : DESIGN_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#0A0A0F',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
  },
  scene: [BootScene, BattleScene, ExplorationScene, WorldMapScene, PartySelectScene, DungeonFailScene],
};
