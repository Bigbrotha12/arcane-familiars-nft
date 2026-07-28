import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { BattleScene } from "./scenes/BattleScene";
import { ExplorationScene } from "./scenes/ExplorationScene";
import { WorldMapScene } from "./scenes/WorldMapScene";
import { PartySelectScene } from "./scenes/PartySelectScene";
import { DungeonFailScene } from "./scenes/DungeonFailScene";

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "game-container",
  backgroundColor: "#0a0a0f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, BattleScene, ExplorationScene, WorldMapScene, PartySelectScene, DungeonFailScene],
};
