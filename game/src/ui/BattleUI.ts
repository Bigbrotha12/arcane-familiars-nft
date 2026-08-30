import Phaser from 'phaser';
import type { BattleFamiliar } from '@arcane-familiars/game-logic';
import { Layout } from './layout';
import { familiarTextureKey, idleAnimKey, idleTextureKey, PLACEHOLDER_FAMILIAR_ID } from '../sprites/registry';

export class BattleUI {
  private scene: Phaser.Scene;
  private layout: Layout;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemySprite!: Phaser.GameObjects.Sprite;
  private battleLog: string[] = [];
  private connectingText?: Phaser.GameObjects.Text;
  private owned: Phaser.GameObjects.GameObject[] = [];
  private floatingTweens: Phaser.Tweens.Tween[] = [];

  private get enemyCenterX(): number {
    return this.layout.x(640);
  }

  private get enemyCenterY(): number {
    return this.layout.y(105);
  }

  private get playerCenterX(): number {
    return this.layout.x(180);
  }

  private get playerCenterY(): number {
    return this.layout.y(332);
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.layout = new Layout(scene);
  }

  private register<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.owned.push(obj);
    return obj;
  }

  init(): void {
    this.createEnemyArea();
    this.createPlayerArea();
    this.showConnecting();
  }

  private createEnemyArea(): void {
    const sx = this.enemyCenterX;
    const sy = this.enemyCenterY;

    this.createGround(sx, sy);
    this.enemySprite = this.register(this.scene.add.sprite(sx, sy, familiarTextureKey(PLACEHOLDER_FAMILIAR_ID)));
    this.enemySprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    this.enemySprite.setDepth(1);
  }

  private createPlayerArea(): void {
    const sx = this.playerCenterX;
    const sy = this.playerCenterY;

    this.createGround(sx, sy);
    this.playerSprite = this.register(this.scene.add.sprite(sx, sy, familiarTextureKey(PLACEHOLDER_FAMILIAR_ID)));
    this.playerSprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    this.playerSprite.setDepth(1);
  }

  private createGround(x: number, y: number): void {
    const ground = this.register(this.scene.add.ellipse(x, y + this.layout.s(50), this.layout.s(120), this.layout.s(28)));
    ground.setStrokeStyle(this.layout.s(3), 0x7C5CFC, 1);
    ground.setFillStyle(0x1E1B4B, 1);
    ground.setDepth(0);
  }

  showConnecting(): void {
    // Guard: destroy any existing connecting text to prevent a leak
    if (this.connectingText) {
      this.connectingText.destroy();
      this.removeFromOwned(this.connectingText);
      this.connectingText = undefined;
    }
    this.connectingText = this.register(this.scene.add.text(
      this.layout.x(400),
      this.layout.y(300),
      'Connecting...',
      {
        fontSize: this.layout.font(18),
        fontFamily: 'DM Sans',
        color: '#A5A3C4',
      },
    ));
    this.connectingText.setOrigin(0.5);
  }

  hideConnecting(): void {
    if (this.connectingText) {
      this.connectingText.destroy();
      this.removeFromOwned(this.connectingText);
      this.connectingText = undefined;
    }
  }

  private removeFromOwned(obj: Phaser.GameObjects.GameObject): void {
    const idx = this.owned.indexOf(obj);
    if (idx !== -1) this.owned.splice(idx, 1);
  }

  updatePlayerDisplay(familiar: BattleFamiliar): void {
    this.applyDisplay(this.playerSprite, familiar, 'right');
  }

  updateEnemyDisplay(familiar: BattleFamiliar): void {
    this.applyDisplay(this.enemySprite, familiar, 'left');
  }

  private applyDisplay(sprite: Phaser.GameObjects.Sprite, familiar: BattleFamiliar, facing: 'right' | 'left'): void {
    const id = familiar.familiarData.id;
    const textureKey = familiarTextureKey(id);
    const idleKey = idleTextureKey(id, facing);
    const animKey = idleAnimKey(id, facing);
    if (this.scene.textures.exists(idleKey) && this.scene.anims.exists(animKey)) {
      const alreadyIdle = sprite.anims.currentAnim?.key === animKey && sprite.frame.texture.key === idleKey;
      if (alreadyIdle) return;
      this.stopAnimIfPlaying(sprite);
      sprite.setTexture(idleKey);
      sprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
      sprite.play(animKey, true);
    } else if (this.scene.textures.exists(textureKey)) {
      const alreadyStatic = !sprite.anims.isPlaying && sprite.frame.texture.key === textureKey;
      if (alreadyStatic) return;
      this.stopAnimIfPlaying(sprite);
      sprite.setTexture(textureKey);
      sprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    }
  }

  private stopAnimIfPlaying(sprite: Phaser.GameObjects.Sprite): void {
    if (sprite.anims.isPlaying) {
      sprite.anims.stop();
    }
  }

  playAbilityEffect(animKey: string): void {
    if (!this.scene.textures.exists(animKey) || !this.scene.anims.exists(animKey)) return;
    const { x, y } = this.getEnemyDamagePosition();
    const effect = this.register(this.scene.add.sprite(x, y, animKey));
    effect.setDepth(2);
    effect.setDisplaySize(this.layout.s(140), this.layout.s(140));
    effect.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      effect.destroy();
      this.removeFromOwned(effect);
    });
    effect.play(animKey);
  }

  addLogMessage(message: string): void {
    this.battleLog.push(message);
    if (this.battleLog.length > 12) {
      this.battleLog.splice(0, this.battleLog.length - 12);
    }
  }

  getLog(): string[] {
    return [...this.battleLog];
  }

  getEnemyDamagePosition(): { x: number; y: number } {
    return { x: this.enemyCenterX, y: this.enemyCenterY - this.layout.s(30) };
  }

  getPlayerDamagePosition(): { x: number; y: number } {
    return { x: this.playerCenterX, y: this.playerCenterY - this.layout.s(30) };
  }

  showDamageNumber(x: number, y: number, amount: number, color: string): void {
    this.addFloatingText(x, y, `-${amount}`, color);
  }

  showHealNumber(x: number, y: number, amount: number, color = '#10B981'): void {
    this.addFloatingText(x, y, `+${amount}`, color);
  }

  private addFloatingText(x: number, y: number, text: string, color: string): void {
    const textObj = this.scene.add.text(x, y, text, {
      fontSize: this.layout.font(22),
      fontFamily: 'Fredoka',
      color,
      fontStyle: '600',
      stroke: '#000000',
      strokeThickness: this.layout.s(3),
    });
    textObj.setOrigin(0.5);
    textObj.setDepth(3);

    const tween = this.scene.tweens.add({
      targets: textObj,
      y: y - this.layout.s(60),
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        textObj.destroy();
        this.floatingTweens = this.floatingTweens.filter(t => t !== tween);
      },
      onStop: () => {
        textObj.destroy();
        this.floatingTweens = this.floatingTweens.filter(t => t !== tween);
      },
    });
    this.floatingTweens.push(tween);
  }

  destroy(): void {
    for (const tween of this.floatingTweens) {
      tween.stop();
    }
    this.floatingTweens = [];

    for (const obj of this.owned) {
      if (obj && obj.scene) {
        obj.destroy();
      }
    }
    this.owned = [];

    // Null out all references so no dangling pointers
    this.playerSprite = null!;
    this.enemySprite = null!;
    this.battleLog = [];
    this.connectingText = undefined;
    this.scene = null!;
  }
}
