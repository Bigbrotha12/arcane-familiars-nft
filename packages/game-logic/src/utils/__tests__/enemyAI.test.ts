import { describe, it, expect } from 'vitest';
import { selectEnemyAction } from '../enemyAI';
import { seededRandom } from '../mathUtils';
import { getFamiliar } from '../../data/familiars';
import { ActionType } from '../../types/battle';
import { EffectType, StatName } from '../../data/abilities';
import type { BattleFamiliar, BattleAction } from '../../types/battle';

function makeEnemy(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: 'enemy',
    familiarData: getFamiliar('meadowGuardian')!,
    currentHp: 240,
    currentMp: 160,
    statusEffects: [],
    cooldowns: {},
    isAlly: false,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: 'player',
    familiarData: getFamiliar('whiteDog')!,
    currentHp: 120,
    currentMp: 80,
    statusEffects: [],
    cooldowns: {},
    isAlly: false,
    ...overrides,
  };
}

function rngFrom(rolls: number[]): () => number {
  let i = 0;
  return () => rolls[i++] ?? 0.5;
}

describe('selectEnemyAction', () => {
  it('defaults to basic attack when all rng checks fail', () => {
    const enemy = makeEnemy();
    const player = makePlayer();
    const rng = rngFrom([0.99, 0.99]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: player.uid,
    });
  });

  it('uses heal when HP is below 30%', () => {
    const enemy = makeEnemy({ currentHp: 50 });
    const player = makePlayer();
    const action = selectEnemyAction(enemy, player, () => 0);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'naturabless',
      targetId: enemy.uid,
    });
  });

  it('falls through to basic attack when low HP but no MP for heal', () => {
    const enemy = makeEnemy({ currentHp: 50, currentMp: 0 });
    const player = makePlayer();
    const rng = rngFrom([0.99, 0.99]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: player.uid,
    });
  });

  it('uses buff when not already buffed and rng passes', () => {
    const enemy = makeEnemy();
    const player = makePlayer();
    const rng = rngFrom([0.01]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'sturdy',
      targetId: enemy.uid,
    });
  });

  it('defaults to basic attack when buff check fails and ability check fails', () => {
    const enemy = makeEnemy();
    const player = makePlayer();
    const rng = rngFrom([0.99, 0.99]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: player.uid,
    });
  });

  it('selects the strongest damage ability when ability rng passes', () => {
    const enemy = makeEnemy({
      statusEffects: [
        {
          abilityId: 'sturdy',
          type: EffectType.Buff,
          stat: StatName.Defense,
          value: 1.5,
          turnsRemaining: 2,
        },
      ],
    });
    const player = makePlayer();
    const rng = rngFrom([0.01]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'brave',
      targetId: player.uid,
    });
  });

  it('picks fireball over shadowstrike as strongest damage for shadowLord', () => {
    const enemy = makeEnemy({
      familiarData: getFamiliar('shadowLord')!,
      currentHp: 300,
      currentMp: 270,
      statusEffects: [
        {
          abilityId: 'quickstep',
          type: EffectType.Buff,
          stat: StatName.Speed,
          value: 1.5,
          turnsRemaining: 2,
        },
      ],
    });
    const player = makePlayer();
    const rng = rngFrom([0.01]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'fireball',
      targetId: player.uid,
    });
  });

  it('works with seededRandom as a deterministic rng source', () => {
    const enemy = makeEnemy({ currentHp: 50 });
    const player = makePlayer();
    const rng = seededRandom(42);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action.type).toBe(ActionType.Ability);
    expect(action.abilityId).toBe('naturabless');
  });

  it('returns an attack action when no abilities are affordable', () => {
    const enemy = makeEnemy({ currentMp: 0 });
    const player = makePlayer();
    const rng = rngFrom([0.99, 0.99]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: player.uid,
    });
  });

  it('skips buff check when buff already active', () => {
    const enemy = makeEnemy({
      statusEffects: [
        {
          abilityId: 'sturdy',
          type: EffectType.Buff,
          stat: StatName.Defense,
          value: 1.5,
          turnsRemaining: 2,
        },
      ],
    });
    const player = makePlayer();
    const rng = rngFrom([0.99]);
    const action = selectEnemyAction(enemy, player, rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: player.uid,
    });
  });
});
