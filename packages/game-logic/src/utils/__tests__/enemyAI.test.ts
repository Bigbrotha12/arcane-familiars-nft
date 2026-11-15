import { describe, it, expect } from 'vitest';
import { selectEnemyAction } from '../enemyAI';
import { seededRandom } from '../mathUtils';
import { getFamiliar } from '../../data/familiars';
import { ActionType } from '../../types/battle';
import { EffectType, StatName } from '../../data/abilities';
import { BALANCE } from '../../data/balance';
import type { BattleFamiliar, BattleAction, StatusEffect } from '../../types/battle';

/**
 * Non-boss enemy with a damage move (brave) and no buff/heal: yellowFighter.
 * Boss fixtures use meadowGuardian (brave, sturdy, naturabless).
 */
function makeEnemy(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: 'enemy',
    familiarData: getFamiliar('yellowFighter')!,
    currentHp: 140,
    currentMp: 60,
    statusEffects: [],
    cooldowns: {},
    isAlly: false,
    ...overrides,
  };
}

function makeBoss(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: 'boss',
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

/** RNG that records how many values the AI consumed. */
function countingRng(rolls: number[] = []): { rng: () => number; calls: () => number } {
  let count = 0;
  const inner = rngFrom(rolls);
  return {
    rng: () => {
      count += 1;
      return inner();
    },
    calls: () => count,
  };
}

const sturdyBuff: StatusEffect[] = [
  {
    abilityId: 'sturdy',
    type: EffectType.Buff,
    stat: StatName.Defense,
    value: 1.5,
    turnsRemaining: 2,
  },
];

describe('selectEnemyAction (non-boss)', () => {
  it('defaults to basic attack when all rng checks fail', () => {
    const enemy = makeEnemy();
    const player = makePlayer();
    const action = selectEnemyAction(enemy, player, rngFrom([0.99, 0.99]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: player.uid,
    });
  });

  it('uses heal when HP is below 30%', () => {
    const enemy = makeEnemy({ familiarData: getFamiliar('tideTurtle')!, currentHp: 20, currentMp: 70 });
    const player = makePlayer();
    const action = selectEnemyAction(enemy, player, () => 0);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'healpulse',
      targetId: enemy.uid,
    });
  });

  it('falls through to basic attack when low HP but no MP for heal', () => {
    const enemy = makeEnemy({ familiarData: getFamiliar('tideTurtle')!, currentHp: 20, currentMp: 0 });
    const player = makePlayer();
    const action = selectEnemyAction(enemy, player, rngFrom([0.99, 0.99]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: player.uid,
    });
  });

  it('never charges (Charge is boss-only)', () => {
    // rng 0 would fire the boss charge branch if it ever ran for non-bosses.
    const enemy = makeEnemy();
    const action = selectEnemyAction(enemy, makePlayer(), () => 0);
    expect(action.type).not.toBe(ActionType.Charge);
  });

  it('uses buff when not already buffed and rng passes', () => {
    const enemy = makeEnemy({ familiarData: getFamiliar('honeyBear')!, currentHp: 150, currentMp: 60 });
    const action = selectEnemyAction(enemy, makePlayer(), rngFrom([0.01]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'sturdy',
      targetId: enemy.uid,
    });
  });

  it('selects the strongest damage ability when ability rng passes', () => {
    const enemy = makeEnemy({
      familiarData: getFamiliar('honeyBear')!,
      currentHp: 150,
      currentMp: 60,
      statusEffects: sturdyBuff,
    });
    const action = selectEnemyAction(enemy, makePlayer(), rngFrom([0.01]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'ironbash',
      targetId: 'player',
    });
  });

  it('picks fireball over flameLash as the strongest damage ability', () => {
    const enemy = makeEnemy({
      familiarData: getFamiliar('emberFox')!,
      currentHp: 100,
      currentMp: 110,
      statusEffects: [
        {
          abilityId: 'cinderCloak',
          type: EffectType.Buff,
          stat: StatName.Arcane,
          value: 1.3,
          turnsRemaining: 2,
        },
      ],
    });
    const action = selectEnemyAction(enemy, makePlayer(), rngFrom([0.01]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'fireball',
      targetId: 'player',
    });
  });

  it('draws exactly the legacy RNG sequence (no charge roll)', () => {
    // No buff ability → buff check still draws once; damage check draws once.
    const enemy = makeEnemy();
    const spy = countingRng([0.99, 0.99]);
    selectEnemyAction(enemy, makePlayer(), spy.rng);
    expect(spy.calls()).toBe(2);

    // A usable buff short-circuits after the first draw.
    const buffing = makeEnemy({ familiarData: getFamiliar('honeyBear')!, currentHp: 150, currentMp: 60 });
    const buffSpy = countingRng([0.01]);
    selectEnemyAction(buffing, makePlayer(), buffSpy.rng);
    expect(buffSpy.calls()).toBe(1);
  });

  it('works with seededRandom as a deterministic rng source', () => {
    const enemy = makeEnemy({ familiarData: getFamiliar('tideTurtle')!, currentHp: 20, currentMp: 70 });
    const action = selectEnemyAction(enemy, makePlayer(), seededRandom(42));
    expect(action.type).toBe(ActionType.Ability);
    expect(action.abilityId).toBe('healpulse');
  });

  it('returns an attack action when no abilities are affordable', () => {
    const enemy = makeEnemy({ currentMp: 0 });
    const action = selectEnemyAction(enemy, makePlayer(), rngFrom([0.99, 0.99]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: 'player',
    });
  });

  it('skips buff check when buff already active', () => {
    const enemy = makeEnemy({
      familiarData: getFamiliar('honeyBear')!,
      currentHp: 150,
      currentMp: 60,
      statusEffects: sturdyBuff,
    });
    const action = selectEnemyAction(enemy, makePlayer(), rngFrom([0.99]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Attack,
      targetId: 'player',
    });
  });
});

describe('selectEnemyAction (boss charge)', () => {
  it('gathers power when the charge roll succeeds', () => {
    const boss = makeBoss();
    const spy = countingRng([BALANCE.bossChargeChance - 0.01]);
    const action = selectEnemyAction(boss, makePlayer(), spy.rng);
    expect(action).toEqual<BattleAction>({ type: ActionType.Charge, targetId: boss.uid });
    expect(spy.calls()).toBe(1);
  });

  it('falls through to the normal tree when the charge roll fails', () => {
    // Boss has no active buff, so the buff check runs next and succeeds.
    const boss = makeBoss();
    const action = selectEnemyAction(boss, makePlayer(), rngFrom([BALANCE.bossChargeChance, 0.01]));
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'sturdy',
      targetId: boss.uid,
    });
  });

  it('heals before it ever considers charging', () => {
    const boss = makeBoss({ currentHp: 50 }); // < 30%
    const spy = countingRng([0]);
    const action = selectEnemyAction(boss, makePlayer(), spy.rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'naturabless',
      targetId: boss.uid,
    });
    expect(spy.calls()).toBe(0);
  });

  it('unleashes the strongest damaging ability when already charged, without RNG', () => {
    const boss = makeBoss({ charged: true });
    const spy = countingRng();
    const action = selectEnemyAction(boss, makePlayer(), spy.rng);
    expect(action).toEqual<BattleAction>({
      type: ActionType.Ability,
      abilityId: 'brave',
      targetId: 'player',
    });
    expect(spy.calls()).toBe(0);
  });

  it('falls back to a basic attack when charged but no damaging ability is usable', () => {
    const boss = makeBoss({ charged: true, currentMp: 0 });
    const spy = countingRng();
    const action = selectEnemyAction(boss, makePlayer(), spy.rng);
    expect(action).toEqual<BattleAction>({ type: ActionType.Attack, targetId: 'player' });
    expect(spy.calls()).toBe(0);
  });

  it('skips a damaging ability that is on cooldown when unleashing', () => {
    const boss = makeBoss({ charged: true, cooldowns: { brave: 2 } });
    const action = selectEnemyAction(boss, makePlayer(), () => 0);
    expect(action).toEqual<BattleAction>({ type: ActionType.Attack, targetId: 'player' });
  });

  it('does not treat a DoT ability as a charged unleash', () => {
    // moonMoth is a non-boss; use a boss-like fixture with only a DoT ability.
    const boss = makeBoss({
      familiarData: { ...getFamiliar('meadowGuardian')!, isBoss: true, abilities: ['hex'] },
      charged: true,
      currentMp: 160,
    });
    const action = selectEnemyAction(boss, makePlayer(), () => 0);
    expect(action).toEqual<BattleAction>({ type: ActionType.Attack, targetId: 'player' });
  });
});
