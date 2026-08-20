import Phaser from 'phaser';
import type { Room, Area } from '@arcane-familiars/game-logic';
import { Layout } from './layout';
import { SceneBackground } from './SceneBackground';

export class ExplorationUI {
  private scene: Phaser.Scene;
  private layout: Layout;

  private sceneBackground!: SceneBackground;
  private currentAreaId = '';
  private logMessages: string[] = [];
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.layout = new Layout(scene);
  }

  init(area: Area): void {
    this.currentAreaId = area.id;
    this.sceneBackground = new SceneBackground(this.scene, this.layout);
    this.sceneBackground.setImage(`room_${this.currentAreaId}_1`);
  }

  showRoomInfo(room: Room, roomIndex: number, totalRooms: number, area: Area): void {
    const depthRatio = roomIndex / Math.max(totalRooms - 1, 1);
    const r = ((area.bgColor >> 16) & 0xff);
    const g = ((area.bgColor >> 8) & 0xff);
    const b = (area.bgColor & 0xff);
    const darkR = Math.floor(r * (0.3 + depthRatio * 0.3));
    const darkG = Math.floor(g * (0.3 + depthRatio * 0.3));
    const darkB = Math.floor(b * (0.3 + depthRatio * 0.3));
    const color = (Math.min(darkR, 255) << 16) | (Math.min(darkG, 255) << 8) | Math.min(darkB, 255);
    this.sceneBackground.setOverlay(color, 0.45);

    const bgKey = `room_${area.id}_${(roomIndex % 3) + 1}`;
    this.sceneBackground.setImage(bgKey);
  }

  addLogMessage(text: string): void {
    this.logMessages.push(text);
    if (this.logMessages.length > 10) {
      this.logMessages.splice(0, this.logMessages.length - 10);
    }
  }

  getLog(): string[] {
    return [...this.logMessages];
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
    this.logMessages = [];
    if (this.sceneBackground) {
      this.sceneBackground.destroy();
    }
  }
}