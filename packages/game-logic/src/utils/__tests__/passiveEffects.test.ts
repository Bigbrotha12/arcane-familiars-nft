import { describe, it, expect } from 'vitest';
import { resolveTurn } from '../battleEngine';
import { getFamiliar } from '../../data/familiars';
import { PASSIVES, type ActivePassive, type PassiveId } from '../../data/passives';
import { EffectType, StatName } from '../../data/abilities';
import { ActionType, type BattleAction, type BattleFamiliar, type StatusEffect } from '../../types/battle';

/** No crit, variance multiplier exactly 1 -> deterministic hits. */
const steadyRng = () => 0.5;

function makeFamiliar(speciesId: string, uid: string, overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  const data = getFamiliar(speciesId);
  if (!data) throw new Error(`Unknown familiar ${speciesId}`);
  return {
    uid,
    familiarData: data,
    currentHp: data.stats.hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: true,
    ...overrides,
  };
}

function withStats(familiar: BattleFamiliar, stats: Partial<BattleFamiliar['familiarData']['stats']>): BattleFamiliar {
  return {
    ...familiar,
    familiarData: { ...familiar.familiarData, stats: { ...familiar.familiarData.stats, ...stats } },
  };
}

function passive(id: PassiveId, tier: 1 | 2 | 3 | 4): ActivePassive {
  return { id, tier, value: PASSIVES[id].tiers[tier - 1], sourceFamiliarId: 'source' };
}

const attack: BattleAction = { type: ActionType.Attack };
const defend: BattleAction = { type: ActionType.Defend };

describe('passive effects in resolveTurn', () => {
  it('Kindling boosts player DoTs and extends them from tier III', () => {
    const player = makeFamiliar('whiteDog', 'p');
    const enemy = makeFamiliar('whiteDog', 'e');
    const result = resolveTurn({ type: ActionType.Ability, abilityId: 'hex' }, player, enemy, defend, steadyRng, [
      passive('kindling', 3),
    ]);

    const dot = result.updatedEnemyFamiliar.statusEffects.find((effect) => effect.type === EffectType.Dot);
    expect(dot).toBeDefined();
    expect(dot!.value).toBe(Math.round(10 * 1.45));
    expect(dot!.turnsRemaining).toBe(4);
  });

  it('Tailwind raises player speed for initiative', () => {
    const player = withStats(makeFamiliar('whiteDog', 'p'), { speed: 60 });
    const enemy = withStats(makeFamiliar('yellowFighter', 'e'), { speed: 62 });

    expect(resolveTurn(attack, player, enemy, attack, steadyRng).steps[0].actorUid).toBe('e');
    expect(resolveTurn(attack, player, enemy, attack, steadyRng, [passive('tailwind', 4)]).steps[0].actorUid).toBe('p');
  });

  it('Tidecaller increases player heals', () => {
    const player = makeFamiliar('whiteDog', 'p', { currentHp: 10 });
    const enemy = makeFamiliar('whiteDog', 'e');
    const result = resolveTurn({ type: ActionType.Ability, abilityId: 'healpulse' }, player, enemy, defend, steadyRng, [
      passive('tidecaller', 2),
    ]);

    expect(result.playerResult.value).toBe(Math.round(120 * 0.3 * 1.22));
  });

  it('Bedrock replaces the guard multiplier while Defending', () => {
    const player = makeFamiliar('whiteDog', 'p');
    const enemy = makeFamiliar('yellowFighter', 'e');

    const plain = resolveTurn(defend, player, enemy, attack, steadyRng);
    const bedrock = resolveTurn(defend, player, enemy, attack, steadyRng, [passive('bedrock', 1)]);

    expect(plain.updatedPlayerFamiliar.currentHp).toBe(120 - Math.round((80 * 100 * 0.5) / 170));
    expect(bedrock.updatedPlayerFamiliar.currentHp).toBe(120 - Math.round((80 * 100 * 0.42) / 170));
  });

  it('Radiance heals the living player at end of turn', () => {
    const player = makeFamiliar('whiteDog', 'p', { currentHp: 50 });
    const enemy = makeFamiliar('whiteDog', 'e');
    const result = resolveTurn(defend, player, enemy, defend, steadyRng, [passive('radiance', 1)]);

    expect(result.updatedPlayerFamiliar.currentHp).toBe(52);
    expect(result.steps.some((step) => step.result.description.includes('Radiance!'))).toBe(true);
  });

  it('Umbral Hunger boosts damage against an afflicted enemy', () => {
    const debuff: StatusEffect = {
      abilityId: 'test',
      type: EffectType.Debuff,
      stat: StatName.Attack,
      value: 0.8,
      turnsRemaining: 2,
    };
    const player = makeFamiliar('whiteDog', 'p');
    const enemy = makeFamiliar('whiteDog', 'e', { statusEffects: [debuff] });

    const plain = resolveTurn(attack, player, enemy, attack, steadyRng);
    const boosted = resolveTurn(attack, player, enemy, attack, steadyRng, [passive('umbralHunger', 1)]);

    expect(plain.playerResult.value).toBe(32);
    expect(boosted.playerResult.value).toBe(Math.round(55 * (100 / 170) * 1.1));
  });

  it('Battle Cry boosts Attack-scaling abilities', () => {
    const player = makeFamiliar('whiteDog', 'p');
    const enemy = makeFamiliar('whiteDog', 'e');
    const action: BattleAction = { type: ActionType.Ability, abilityId: 'ironbash' };

    const plain = resolveTurn(action, player, enemy, attack, steadyRng);
    const boosted = resolveTurn(action, player, enemy, attack, steadyRng, [passive('battleCry', 1)]);

    expect(plain.playerResult.value).toBe(Math.round((55 * 1.3 * 100) / 170));
    expect(boosted.playerResult.value).toBe(Math.round(((55 * 1.3 * 100) / 170) * 1.08));
  });

  it('Mana Spring changes the basic-attack MP restore fraction', () => {
    const player = makeFamiliar('whiteDog', 'p', { currentMp: 10 });
    const enemy = makeFamiliar('whiteDog', 'e');
    const result = resolveTurn(attack, player, enemy, defend, steadyRng, [passive('manaSpring', 3)]);

    expect(result.playerResult.actorMpRestore).toBe(10);
    expect(result.updatedPlayerFamiliar.currentMp).toBe(20);
  });

  it('Second Wind triggers once when HP first drops below 30%', () => {
    const player = makeFamiliar('whiteDog', 'p', { currentHp: 37 });
    const enemy = makeFamiliar('whiteDog', 'e');
    const passives = [passive('secondWind', 2)];

    const first = resolveTurn(attack, player, enemy, attack, steadyRng, passives);
    expect(first.updatedPlayerFamiliar.currentHp).toBe(5 + Math.round(120 * 0.14));
    expect(first.updatedPlayerFamiliar.secondWindUsed).toBe(true);
    expect(first.steps.some((step) => step.result.description.includes('Second Wind!'))).toBe(true);

    // Above the threshold again but the once-per-battle flag still blocks it.
    const second = resolveTurn(
      attack,
      { ...first.updatedPlayerFamiliar, currentHp: 40 },
      enemy,
      attack,
      steadyRng,
      passives
    );
    expect(second.updatedPlayerFamiliar.currentHp).toBe(8);
    expect(second.steps.some((step) => step.result.description.includes('Second Wind!'))).toBe(false);
  });

  it('Second Wind does not save a familiar that reaches 0 HP', () => {
    const player = makeFamiliar('whiteDog', 'p', { currentHp: 37 });
    const enemy = withStats(makeFamiliar('whiteDog', 'e'), { attack: 120 });
    const result = resolveTurn(attack, player, enemy, attack, steadyRng, [passive('secondWind', 4)]);

    expect(result.updatedPlayerFamiliar.currentHp).toBe(0);
    expect(result.updatedPlayerFamiliar.secondWindUsed).not.toBe(true);
  });

  it('Relay Instinct discounts and consumes the first ability', () => {
    const player = makeFamiliar('whiteDog', 'p', { currentMp: 20, relayDiscount: 0.4 });
    const enemy = makeFamiliar('whiteDog', 'e');
    const action: BattleAction = { type: ActionType.Ability, abilityId: 'brave' };
    const passives = [passive('relayInstinct', 1)];

    const first = resolveTurn(action, player, enemy, defend, steadyRng, passives);
    expect(first.updatedPlayerFamiliar.currentMp).toBe(15);
    expect(first.updatedPlayerFamiliar.relayDiscount).toBeUndefined();
    expect(first.steps.some((step) => step.result.description.includes('Relay Instinct!'))).toBe(true);

    const second = resolveTurn(action, first.updatedPlayerFamiliar, enemy, defend, steadyRng, passives);
    expect(second.updatedPlayerFamiliar.currentMp).toBe(7);
  });

  it('applies passives from both party members together', () => {
    const player = withStats(makeFamiliar('whiteDog', 'p'), { speed: 60 });
    const enemy = withStats(makeFamiliar('whiteDog', 'e'), { speed: 62 });
    const result = resolveTurn({ type: ActionType.Ability, abilityId: 'hex' }, player, enemy, defend, steadyRng, [
      passive('tailwind', 4),
      passive('kindling', 1),
    ]);

    expect(result.steps[0].actorUid).toBe('p');
    const dot = result.updatedEnemyFamiliar.statusEffects.find((effect) => effect.type === EffectType.Dot);
    expect(dot!.value).toBe(Math.round(10 * 1.25));
  });

  it('does not stack the same passive from both party members', () => {
    const player = makeFamiliar('whiteDog', 'p');
    const enemy = makeFamiliar('whiteDog', 'e');
    const result = resolveTurn({ type: ActionType.Ability, abilityId: 'hex' }, player, enemy, defend, steadyRng, [
      passive('kindling', 1),
      passive('kindling', 3),
    ]);

    const dot = result.updatedEnemyFamiliar.statusEffects.find((effect) => effect.type === EffectType.Dot);
    expect(dot!.value).toBe(Math.round(10 * 1.45));
  });
});
