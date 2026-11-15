import Phaser from 'phaser';
import type { BattleFamiliar } from '@arcane-familiars/game-logic';
import { Layout } from './layout';
import { MOTION, prefersReducedMotion } from './motion';
import { ensureBattleTextures, FX } from './textures';
import { C } from './theme';
import {
  familiarTextureKey,
  safeFamiliarTextureKey,
  idleAnimKey,
  idleTextureKey,
  PLACEHOLDER_FAMILIAR_ID,
} from '../sprites/registry';

export type BattleSide = 'player' | 'enemy';

interface DamageNumberOptions {
  critical?: boolean;
}

/**
 * Battle stage: combatant sprites plus every code-drawn effect (entrance,
 * lunge, impact flash, recoil, camera shake, affinity banners, shield rings,
 * sparkles, boss aura, faints, floating numbers).
 *
 * Everything here is tween/timer based — no shipped art or audio. All tweens
 * and timers are tracked so `destroy()` (the scene shutdown path) leaves
 * nothing running. Under `prefers-reduced-motion` the decorative choreography
 * is skipped while state changes still land instantly.
 */
export class BattleUI {
  private scene: Phaser.Scene;
  private layout: Layout;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemySprite!: Phaser.GameObjects.Sprite;
  private battleLog: string[] = [];
  private connectingText?: Phaser.GameObjects.Text;
  private owned: Phaser.GameObjects.GameObject[] = [];
  private tweens: Set<Phaser.Tweens.Tween> = new Set();
  private timers: Phaser.Time.TimerEvent[] = [];
  private idleTweens: Partial<Record<BattleSide, Phaser.Tweens.Tween>> = {};
  private fainted: Partial<Record<BattleSide, boolean>> = {};
  private aura?: Phaser.GameObjects.Image;
  private auraTween?: Phaser.Tweens.Tween;

  private get enemyCenterX(): number {
    return this.layout.x(620);
  }

  private get enemyCenterY(): number {
    return this.layout.y(132);
  }

  private get playerCenterX(): number {
    return this.layout.x(200);
  }

  private get playerCenterY(): number {
    // Sits well above the bottom HUD (action bar + log occupy the last ~190px
    // of the 800x600 design space). 262 leaves the 120px sprite fully visible.
    return this.layout.y(262);
  }

  /** Set by destroy(); every public draw method is a no-op afterwards, because
   * BattleScene can still be draining a turn's step loop when the player exits. */
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.layout = new Layout(scene);
    ensureBattleTextures(scene);
  }

  private register<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.owned.push(obj);
    return obj;
  }

  private removeFromOwned(obj: Phaser.GameObjects.GameObject): void {
    const idx = this.owned.indexOf(obj);
    if (idx !== -1) this.owned.splice(idx, 1);
  }

  /** Track a tween so destroy() can stop it. */
  private track(tween: Phaser.Tweens.Tween): Phaser.Tweens.Tween {
    this.tweens.add(tween);
    const forget = () => this.tweens.delete(tween);
    tween.once(Phaser.Tweens.Events.TWEEN_COMPLETE, forget);
    tween.once(Phaser.Tweens.Events.TWEEN_STOP, forget);
    return tween;
  }

  private after(ms: number, callback: () => void): void {
    if (this.destroyed) return;
    const timer = this.scene.time.delayedCall(ms, () => {
      this.timers = this.timers.filter((t) => t !== timer);
      callback();
    });
    this.timers.push(timer);
  }

  private sprite(side: BattleSide): Phaser.GameObjects.Sprite {
    if (this.destroyed) return null as unknown as Phaser.GameObjects.Sprite;
    return side === 'player' ? this.playerSprite : this.enemySprite;
  }

  private basePosition(side: BattleSide): { x: number; y: number } {
    return side === 'player'
      ? { x: this.playerCenterX, y: this.playerCenterY }
      : { x: this.enemyCenterX, y: this.enemyCenterY };
  }

  init(): void {
    this.createEnemyArea();
    this.createPlayerArea();
    this.showConnecting();
  }

  private createEnemyArea(): void {
    const { x, y } = this.basePosition('enemy');
    this.createGround(x, y);
    this.enemySprite = this.register(this.scene.add.sprite(x, y, familiarTextureKey(PLACEHOLDER_FAMILIAR_ID)));
    this.enemySprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    this.enemySprite.setDepth(1);
  }

  private createPlayerArea(): void {
    const { x, y } = this.basePosition('player');
    this.createGround(x, y);
    this.playerSprite = this.register(this.scene.add.sprite(x, y, familiarTextureKey(PLACEHOLDER_FAMILIAR_ID)));
    this.playerSprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    this.playerSprite.setDepth(1);
  }

  private createGround(x: number, y: number): void {
    const ground = this.register(
      this.scene.add.ellipse(x, y + this.layout.s(52), this.layout.s(120), this.layout.s(28))
    );
    ground.setStrokeStyle(this.layout.s(3), C.primary, 1);
    ground.setFillStyle(0x1e1b4b, 1);
    ground.setDepth(0);
  }

  showConnecting(): void {
    if (this.connectingText) {
      this.connectingText.destroy();
      this.removeFromOwned(this.connectingText);
      this.connectingText = undefined;
    }
    this.connectingText = this.register(
      this.scene.add.text(this.layout.x(400), this.layout.y(300), 'Connecting...', {
        fontSize: this.layout.font(18),
        fontFamily: 'DM Sans',
        color: '#A5A3C4',
      })
    );
    this.connectingText.setOrigin(0.5);
  }

  hideConnecting(): void {
    if (this.connectingText) {
      this.connectingText.destroy();
      this.removeFromOwned(this.connectingText);
      this.connectingText = undefined;
    }
  }

  updatePlayerDisplay(familiar: BattleFamiliar): void {
    if (this.destroyed) return;
    this.applyDisplay(this.playerSprite, familiar, 'right');
    this.syncIdleFloat('player');
  }

  updateEnemyDisplay(familiar: BattleFamiliar): void {
    if (this.destroyed) return;
    this.applyDisplay(this.enemySprite, familiar, 'left');
    this.syncIdleFloat('enemy');
  }

  private applyDisplay(sprite: Phaser.GameObjects.Sprite, familiar: BattleFamiliar, facing: 'right' | 'left'): void {
    const id = familiar.familiarData.id;
    const textureKey = safeFamiliarTextureKey(this.scene, id);
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

  // ---------------------------------------------------------------- entrance

  /** Slide in from the sprite's own side + fade in (state is instant if reduced motion). */
  playEntrance(side: BattleSide, options: { boss?: boolean } = {}): void {
    if (this.destroyed) return;
    const sprite = this.sprite(side);
    if (!sprite) return;
    const base = this.basePosition(side);

    this.stopIdleFloat(side);
    this.fainted[side] = false;
    sprite.setAngle(0);

    if (prefersReducedMotion()) {
      sprite.setPosition(base.x, base.y).setAlpha(1).clearTint();
      this.syncIdleFloat(side);
      return;
    }

    const offset = this.layout.s(220) * (side === 'player' ? -1 : 1);
    sprite.setPosition(base.x + offset, base.y);
    sprite.setAlpha(0);
    this.track(
      this.scene.tweens.add({
        targets: sprite,
        x: base.x,
        alpha: 1,
        duration: MOTION.medium,
        ease: 'Cubic.easeOut',
        onComplete: () => this.syncIdleFloat(side),
      })
    );

    if (options.boss && side === 'enemy') this.cameraPunch();
  }

  private cameraPunch(): void {
    if (prefersReducedMotion()) return;
    const camera = this.scene.cameras.main;
    camera.zoomTo(1.04, MOTION.short, 'Cubic.easeOut');
    this.after(MOTION.short + MOTION.micro, () => {
      camera.zoomTo(1, MOTION.medium, 'Cubic.easeOut');
    });
  }

  /** Short small-amplitude screen shake (critical hits, boss unleashes). */
  playCameraShake(): void {
    if (this.destroyed) return;
    if (prefersReducedMotion()) return;
    this.scene.cameras.main.shake(150, 0.004);
  }

  // ------------------------------------------------------------------- idle

  /**
   * DESIGN.md "familiar float": a 3s ease-in-out bob. Only static sprites get
   * it — a sprite with an idle sheet already has its own idle animation.
   */
  private syncIdleFloat(side: BattleSide): void {
    const sprite = this.sprite(side);
    if (!sprite || this.fainted[side]) return;

    const hasIdleAnim = Boolean(sprite.anims.currentAnim) && sprite.anims.isPlaying;
    if (hasIdleAnim || prefersReducedMotion()) {
      this.stopIdleFloat(side);
      sprite.setY(this.basePosition(side).y);
      return;
    }
    if (this.idleTweens[side]) return;

    const base = this.basePosition(side);
    sprite.setY(base.y);
    const amplitude = this.layout.s(5);
    const tween = this.track(
      this.scene.tweens.add({
        targets: sprite,
        y: base.y - amplitude,
        duration: MOTION.long * 2.6,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );
    this.idleTweens[side] = tween;
  }

  private stopIdleFloat(side: BattleSide): void {
    const tween = this.idleTweens[side];
    if (tween) {
      tween.stop();
      this.tweens.delete(tween);
      this.idleTweens[side] = undefined;
    }
  }

  // --------------------------------------------------------------- attacks

  /** Attacker lunges toward its opponent and snaps back (short, ease-out). */
  playAttack(side: BattleSide): void {
    const sprite = this.sprite(side);
    if (!sprite || prefersReducedMotion() || this.fainted[side]) return;
    const base = this.basePosition(side);
    const direction = side === 'player' ? 1 : -1;

    this.track(
      this.scene.tweens.add({
        targets: sprite,
        x: base.x + direction * this.layout.s(40),
        duration: MOTION.micro + 40,
        ease: 'Quad.easeOut',
        yoyo: true,
        yoyoDelay: 30,
      })
    );
  }

  /**
   * Impact feedback: white flash (~80ms), recoil, brief shake. Critical hits
   * recoil ~2x further and shake the camera a little.
   */
  playImpact(side: BattleSide, options: DamageNumberOptions = {}): void {
    const sprite = this.sprite(side);
    if (!sprite || this.fainted[side]) return;
    const { critical = false } = options;
    const base = this.basePosition(side);
    const direction = side === 'player' ? -1 : 1;

    if (prefersReducedMotion()) return;

    sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.after(MOTION.micro, () => {
      if (!sprite.active) return;
      sprite.clearTint();
      sprite.setTintMode(Phaser.TintModes.MULTIPLY);
    });

    this.track(
      this.scene.tweens.add({
        targets: sprite,
        x: base.x + direction * this.layout.s(critical ? 18 : 9),
        duration: MOTION.micro,
        ease: 'Quad.easeOut',
        yoyo: true,
        yoyoDelay: 20,
      })
    );

    if (critical) this.playCameraShake();
  }

  /** Faint: drop + fade before the relay / outcome screen. */
  playFaint(side: BattleSide): void {
    const sprite = this.sprite(side);
    if (!sprite || this.fainted[side]) return;
    this.fainted[side] = true;
    this.stopIdleFloat(side);
    const base = this.basePosition(side);

    if (prefersReducedMotion()) {
      sprite.setAlpha(0);
      return;
    }

    this.track(
      this.scene.tweens.add({
        targets: sprite,
        y: base.y + this.layout.s(20),
        alpha: 0,
        angle: side === 'player' ? -12 : 12,
        duration: MOTION.medium,
        ease: 'Quad.easeIn',
      })
    );
  }

  // ------------------------------------------------------------------- boss

  /**
   * Pulsing red/amber aura while a boss is charged. Idempotent so the scene can
   * call it after every state update (including resuming a battle from
   * bootstrap) without stacking emitters.
   */
  setCharged(charged: boolean): void {
    if (this.destroyed) return;
    if (charged && !this.aura) {
      const base = this.basePosition('enemy');
      this.aura = this.register(
        this.scene.add
          .image(base.x, base.y, FX.glow)
          .setTint(0xf59e0b)
          .setDisplaySize(this.layout.s(170), this.layout.s(170))
      );
      this.aura.setDepth(0.5);
      this.aura.setAlpha(prefersReducedMotion() ? 0.4 : 0.25);
      this.aura.setBlendMode(Phaser.BlendModes.ADD);
      if (!prefersReducedMotion()) {
        this.auraTween = this.track(
          this.scene.tweens.add({
            targets: this.aura,
            alpha: { from: 0.2, to: 0.5 },
            scale: { from: this.aura.scale * 0.94, to: this.aura.scale * 1.08 },
            duration: MOTION.long * 1.6,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          })
        );
      }
      return;
    }

    if (!charged && this.aura) {
      this.auraTween?.stop();
      this.auraTween = undefined;
      this.aura.destroy();
      this.removeFromOwned(this.aura);
      this.aura = undefined;
    }
  }

  /** Persistent callout line ("<Name> is gathering power — Guard!"). */
  showCallout(text: string, color = '#F59E0B'): void {
    if (this.destroyed) return;
    const callout = this.register(
      this.scene.add
        .text(this.layout.x(400), this.layout.y(208), text, {
          fontSize: this.layout.font(19),
          fontFamily: 'Fredoka',
          fontStyle: '600',
          color,
          align: 'center',
          wordWrap: { width: this.layout.s(560) },
          stroke: '#0A0A0F',
          strokeThickness: this.layout.s(4),
        })
        .setOrigin(0.5)
        .setDepth(4)
    );
    callout.setAlpha(0);

    const remove = () => {
      if (!callout.active) return;
      callout.destroy();
      this.removeFromOwned(callout);
    };

    if (prefersReducedMotion()) {
      callout.setAlpha(1);
      this.after(1400, remove);
      return;
    }

    this.track(
      this.scene.tweens.add({
        targets: callout,
        alpha: 1,
        y: this.layout.y(196),
        duration: MOTION.medium,
        ease: 'Cubic.easeOut',
        hold: 900,
        yoyo: true,
        onComplete: remove,
      })
    );
  }

  // -------------------------------------------------------------- feedback

  /** Affinity banner near the target: rises and fades. */
  showEffectiveness(target: BattleSide, effectiveness: 'strong' | 'weak'): void {
    if (this.destroyed) return;
    const base = this.basePosition(target);
    const strong = effectiveness === 'strong';
    const text = strong ? 'Super effective!' : 'Resisted';
    this.riseAndFadeText(base.x, base.y - this.layout.s(86), text, strong ? '#2DD4BF' : '#A5A3C4');
  }

  private riseAndFadeText(x: number, y: number, text: string, color: string): void {
    const label = this.register(
      this.scene.add.text(x, y, text, {
        fontSize: this.layout.font(15),
        fontFamily: 'Fredoka',
        fontStyle: '600',
        color,
        stroke: '#0A0A0F',
        strokeThickness: this.layout.s(3),
      })
    );
    label.setOrigin(0.5).setDepth(4);

    const remove = () => {
      if (!label.active) return;
      label.destroy();
      this.removeFromOwned(label);
    };

    if (prefersReducedMotion()) {
      this.after(700, remove);
      return;
    }

    this.track(
      this.scene.tweens.add({
        targets: label,
        y: y - this.layout.s(28),
        alpha: { from: 1, to: 0 },
        duration: MOTION.long,
        ease: 'Cubic.easeOut',
        onComplete: remove,
      })
    );
  }

  /** Guard ring pulse (Defend, or a hit the guard reduced) + optional tag. */
  playGuardRing(side: BattleSide, options: { label?: string } = {}): void {
    if (this.destroyed) return;
    const base = this.basePosition(side);
    const ring = this.register(
      this.scene.add
        .image(base.x, base.y, FX.ring)
        .setTint(0x7c5cfc)
        .setDisplaySize(this.layout.s(110), this.layout.s(110))
    );
    ring.setDepth(2).setAlpha(0.9);

    if (prefersReducedMotion()) {
      ring.setAlpha(0.5);
      this.after(MOTION.short, () => {
        ring.destroy();
        this.removeFromOwned(ring);
      });
    } else {
      this.track(
        this.scene.tweens.add({
          targets: ring,
          displayWidth: this.layout.s(160),
          displayHeight: this.layout.s(160),
          alpha: 0,
          duration: MOTION.medium,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            ring.destroy();
            this.removeFromOwned(ring);
          },
        })
      );
    }

    if (options.label) {
      this.riseAndFadeText(base.x, base.y - this.layout.s(72), options.label, '#A78BFA');
    }
  }

  /** Teal sparkles rising from the healed combatant. */
  playHealSparkles(side: BattleSide): void {
    if (this.destroyed) return;
    if (prefersReducedMotion()) return;
    const base = this.basePosition(side);
    const count = 7;
    for (let i = 0; i < count; i++) {
      const spark = this.register(this.scene.add.image(base.x, base.y, FX.spark));
      spark.setDepth(2).setTint(0x2dd4bf);
      spark.setDisplaySize(this.layout.s(14), this.layout.s(14));
      const offsetX = this.layout.s(Phaser.Math.Between(-40, 40));
      const offsetY = this.layout.s(Phaser.Math.Between(-16, 24));
      spark.setPosition(base.x + offsetX, base.y + offsetY);
      spark.setAlpha(0.9);

      this.track(
        this.scene.tweens.add({
          targets: spark,
          y: spark.y - this.layout.s(Phaser.Math.Between(46, 82)),
          x: spark.x + this.layout.s(Phaser.Math.Between(-12, 12)),
          alpha: 0,
          scale: spark.scale * 0.6,
          delay: i * 45,
          duration: MOTION.long,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            spark.destroy();
            this.removeFromOwned(spark);
          },
        })
      );
    }
  }

  /** Chevron burst: up + yellow/purple for buffs, down + red for debuffs. */
  playChevronBurst(side: BattleSide, direction: 'up' | 'down', color: number): void {
    if (this.destroyed) return;
    if (prefersReducedMotion()) return;
    const base = this.basePosition(side);
    for (let i = 0; i < 3; i++) {
      const chevron = this.register(this.scene.add.image(base.x, base.y, FX.chevron).setTint(color));
      chevron.setDepth(2);
      chevron.setDisplaySize(this.layout.s(26), this.layout.s(20));
      chevron.setPosition(base.x + this.layout.s((i - 1) * 34), base.y + (direction === 'up' ? 0 : 0));
      chevron.setAngle(direction === 'down' ? 180 : 0);
      chevron.setAlpha(0.95);

      this.track(
        this.scene.tweens.add({
          targets: chevron,
          y: chevron.y + (direction === 'up' ? -this.layout.s(54) : this.layout.s(54)),
          alpha: 0,
          delay: i * 60,
          duration: MOTION.medium + MOTION.short,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            chevron.destroy();
            this.removeFromOwned(chevron);
          },
        })
      );
    }
  }

  playAbilityEffect(animKey: string): void {
    if (this.destroyed || prefersReducedMotion()) return;
    if (!this.scene.textures.exists(animKey) || !this.scene.anims.exists(animKey)) return;
    const { x, y } = this.getEnemyDamagePosition();
    const effect = this.register(this.scene.add.sprite(x, y, animKey));
    effect.setDepth(2);
    effect.setDisplaySize(this.layout.s(140), this.layout.s(140));
    // Belt-and-braces cleanup: an interrupted animation (sprite retextured,
    // scene paused) never fires ANIMATION_COMPLETE and would leak the sprite.
    const cleanup = () => {
      if (effect.active) effect.destroy();
      this.removeFromOwned(effect);
    };
    effect.once(Phaser.Animations.Events.ANIMATION_COMPLETE, cleanup);
    this.after(1200, cleanup);
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

  getDamagePosition(side: BattleSide): { x: number; y: number } {
    return side === 'player' ? this.getPlayerDamagePosition() : this.getEnemyDamagePosition();
  }

  showDamageNumber(x: number, y: number, amount: number, color: string, options: DamageNumberOptions = {}): void {
    if (this.destroyed) return;
    this.addFloatingText(x, y, `-${amount}`, color, options);
  }

  showHealNumber(x: number, y: number, amount: number, color = '#10B981'): void {
    if (this.destroyed) return;
    this.addFloatingText(x, y, `+${amount}`, color);
  }

  private addFloatingText(x: number, y: number, text: string, color: string, options: DamageNumberOptions = {}): void {
    const { critical = false } = options;
    // Small random x-jitter so two numbers in the same beat do not stack.
    const jitter = this.layout.s(Phaser.Math.Between(-14, 14));

    const textObj = this.scene.add.text(x + jitter, y, text, {
      fontSize: this.layout.font(critical ? 30 : 24),
      fontFamily: 'JetBrains Mono',
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: this.layout.s(4),
    });
    textObj.setOrigin(0.5);
    textObj.setDepth(3);

    if (critical && !prefersReducedMotion()) textObj.setScale(1.4);

    const remove = () => {
      if (!textObj.active) return;
      textObj.destroy();
    };

    if (prefersReducedMotion()) {
      this.after(MOTION.short + 200, remove);
      return;
    }

    this.track(
      this.scene.tweens.add({
        targets: textObj,
        y: y - this.layout.s(critical ? 74 : 62),
        alpha: 0,
        scale: 1,
        duration: critical ? MOTION.long + 240 : MOTION.long + 160,
        ease: 'Power2',
        onComplete: remove,
        onStop: remove,
      })
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const tween of this.tweens) {
      tween.stop();
    }
    this.tweens.clear();
    this.idleTweens = {};
    this.auraTween = undefined;
    this.aura = undefined;

    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];

    for (const obj of this.owned) {
      if (obj && obj.scene) {
        obj.destroy();
      }
    }
    this.owned = [];

    this.playerSprite = null!;
    this.enemySprite = null!;
    this.battleLog = [];
    this.connectingText = undefined;
    this.fainted = {};
    this.scene = null!;
  }
}
