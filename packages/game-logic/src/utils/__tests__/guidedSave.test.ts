import { describe, it, expect } from 'vitest';
import { resolveTurn, type GuidedSaveRuntime } from '../battleEngine';
import { getFamiliar } from '../../data/familiars';
import { ActionType, type BattleFamiliar } from '../../types/battle';
import { EffectType, StatName } from '../../data/abilities';

/** No crit, variance multiplier exactly 1 → every hit is deterministic. */
function steadyRng(): () => number {
  return () => 0.5;
}

function makeFamiliar(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: 'player-familiar',
    familiarData: getFamiliar('whiteDog')!,
    currentHp: 120,
    currentMp: 80,
    statusEffects: [],
    cooldowns: {},
    isAlly: true,
    ...overrides,
  };
}

/** A heavy hitter: one basic attack always takes a low-HP familiar to 0. */
function makeEnemy(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  const base = getFamiliar('whiteDog')!;
  return makeFamiliar({
    uid: 'enemy-familiar',
    isAlly: false,
    familiarData: { ...base, stats: { ...base.stats, attack: 500 } },
    ...overrides,
  });
}

const guidedUnused: GuidedSaveRuntime = { enabled: true, used: false };
const guidedSpent: GuidedSaveRuntime = { enabled: true, used: true };

const defend = { type: ActionType.Defend };

describe('guided first battle save', () => {
  it('holds the player at 1 HP once and logs a step', () => {
    const player = makeFamiliar({ currentHp: 5 });
    const enemy = makeEnemy();

    const result = resolveTurn(defend, player, enemy, { type: ActionType.Attack }, steadyRng(), [], guidedUnused);

    expect(result.updatedPlayerFamiliar.currentHp).toBe(1);
    expect(result.guidedSaveUsed).toBe(true);
    expect(result.steps.some((step) => step.result.description === `${player.familiarData.name} holds on!`)).toBe(true);
  });

  it('lets the next lethal hit KO normally', () => {
    const player = makeFamiliar({ currentHp: 5 });
    const enemy = makeEnemy();
    const first = resolveTurn(defend, player, enemy, { type: ActionType.Attack }, steadyRng(), [], guidedUnused);

    const second = resolveTurn(
      defend,
      first.updatedPlayerFamiliar,
      first.updatedEnemyFamiliar,
      { type: ActionType.Attack },
      steadyRng(),
      [],
      guidedSpent
    );

    expect(second.updatedPlayerFamiliar.currentHp).toBe(0);
    expect(second.steps.some((step) => step.result.description.endsWith('holds on!'))).toBe(false);
  });

  it('leaves non-guided battles alone', () => {
    const player = makeFamiliar({ currentHp: 5 });
    const enemy = makeEnemy();

    const result = resolveTurn(defend, player, enemy, { type: ActionType.Attack }, steadyRng());

    expect(result.updatedPlayerFamiliar.currentHp).toBe(0);
    expect(result.guidedSaveUsed).toBeUndefined();
    expect(result.steps.some((step) => step.result.description.endsWith('holds on!'))).toBe(false);
  });

  it('saves a lethal DoT tick once', () => {
    const player = makeFamiliar({
      currentHp: 20,
      statusEffects: [{ abilityId: 'hex', type: EffectType.Dot, stat: StatName.Hp, value: 50, turnsRemaining: 2 }],
    });

    const result = resolveTurn(
      defend,
      player,
      makeFamiliar({ uid: 'enemy-familiar', isAlly: false }),
      { type: ActionType.Defend },
      steadyRng(),
      [],
      guidedUnused
    );

    expect(result.updatedPlayerFamiliar.currentHp).toBe(1);
    expect(result.guidedSaveUsed).toBe(true);
    expect(result.steps.some((step) => step.result.description === `${player.familiarData.name} holds on!`)).toBe(true);
  });

  it('never protects the enemy', () => {
    const player = makeFamiliar();
    const enemy = makeEnemy({ currentHp: 1 });

    const result = resolveTurn({ type: ActionType.Attack }, player, enemy, defend, steadyRng(), [], guidedUnused);

    expect(result.updatedEnemyFamiliar.currentHp).toBe(0);
    expect(result.guidedSaveUsed).toBe(false);
    expect(result.steps.some((step) => step.result.description.endsWith('holds on!'))).toBe(false);
  });
});
