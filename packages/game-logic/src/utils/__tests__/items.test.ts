import { describe, it, expect } from 'vitest';
import { resolveTurn } from '../battleEngine';
import { seededRandom } from '../mathUtils';
import { getFamiliar } from '../../data/familiars';
import { ActionType } from '../../types/battle';
import { EffectType, StatName } from '../../data/abilities';
import { getItem, describeItem, ITEMS, type ItemData } from '../../data/items';
import type { BattleFamiliar, BattleAction } from '../../types/battle';

function makeRng(seed = 42): () => number {
  return seededRandom(seed);
}

let uidCounter = 0;

function makePlayer(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: `player-${++uidCounter}`,
    familiarData: getFamiliar('whiteDog')!,
    currentHp: 60,
    currentMp: 40,
    statusEffects: [],
    cooldowns: {},
    isAlly: true,
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: `enemy-${++uidCounter}`,
    familiarData: getFamiliar('leafBunny')!,
    currentHp: 90,
    currentMp: 60,
    statusEffects: [],
    cooldowns: {},
    isAlly: false,
    ...overrides,
  };
}

function itemAction(itemId: string): BattleAction {
  return { type: ActionType.Item, itemId };
}

function useItem(item: ItemData, player = makePlayer(), enemy = makeEnemy()) {
  const enemyAction: BattleAction = { type: ActionType.Defend };
  const result = resolveTurn(itemAction(item.id), player, enemy, enemyAction, makeRng());
  return result;
}

describe('item data registry', () => {
  it('exposes all ten basic items', () => {
    expect(Object.keys(ITEMS).sort()).toEqual(
      [
        'elixir',
        'ether_large',
        'ether_small',
        'fire_bomb',
        'frost_bomb',
        'lucky_coin',
        'phoenix_feather',
        'potion_medium',
        'potion_small',
        'tonic',
      ].sort()
    );
  });

  it('getItem returns undefined for unknown ids', () => {
    expect(getItem('does_not_exist')).toBeUndefined();
  });

  it('derives descriptions from effects when none are hand-written', () => {
    expect(describeItem(getItem('potion_small')!)).toBe('Restores 30 HP');
    expect(describeItem(getItem('elixir')!)).toBe('Restores 40 HP, Restores 25 MP');
    expect(describeItem(getItem('fire_bomb')!)).toBe('Deals 25 damage to the enemy');
    expect(describeItem(getItem('frost_bomb')!)).toBe('Deals 15 damage to the enemy, -30% enemy Speed for 2 turns');
    expect(describeItem(getItem('phoenix_feather')!)).toBe('Revives fainted party members at 50% HP');
    expect(describeItem(getItem('lucky_coin')!)).toBe('Gain 50 currency');
  });

  it('prefers hand-written descriptions when present', () => {
    const item: ItemData = { ...getItem('potion_small')!, description: 'custom' };
    expect(describeItem(item)).toBe('custom');
  });

  it('only drops items with a positive dropWeight into the treasure pool', () => {
    // lucky_coin has no dropWeight and must never drop.
    expect(getItem('lucky_coin')!.dropWeight).toBeUndefined();
  });
});

describe('item effects in battle', () => {
  it('heal_hp restores HP without exceeding max', () => {
    const player = makePlayer({ currentHp: 100 });
    const { playerResult, updatedPlayerFamiliar } = useItem(getItem('potion_small')!, player);
    expect(playerResult.effectType).toBe(EffectType.Heal);
    expect(playerResult.value).toBe(20); // clamped: only 20 HP missing
    expect(updatedPlayerFamiliar.currentHp).toBe(120); // maxHp
  });

  it('heal_mp restores MP without exceeding max', () => {
    const { playerResult, updatedPlayerFamiliar } = useItem(getItem('ether_small')!);
    expect(playerResult.effectType).toBe(EffectType.MpHeal);
    expect(playerResult.value).toBe(20);
    expect(playerResult.mpValue).toBeUndefined();
    expect(updatedPlayerFamiliar.currentMp).toBe(60);
  });

  it('multi-effect items restore HP and MP in one turn', () => {
    const player = makePlayer({ currentHp: 60, currentMp: 40 });
    const { playerResult, updatedPlayerFamiliar } = useItem(getItem('elixir')!, player);
    expect(playerResult.effectType).toBe(EffectType.Heal);
    expect(playerResult.value).toBe(40);
    expect(playerResult.mpValue).toBe(25);
    expect(updatedPlayerFamiliar.currentHp).toBe(100);
    expect(updatedPlayerFamiliar.currentMp).toBe(65);
  });

  it('damage items hit the enemy, not the user', () => {
    const enemy = makeEnemy();
    const { playerResult, updatedEnemyFamiliar, updatedPlayerFamiliar } = useItem(
      getItem('fire_bomb')!,
      makePlayer(),
      enemy
    );
    expect(playerResult.effectType).toBe(EffectType.Damage);
    expect(playerResult.targetId).not.toBe(updatedPlayerFamiliar.uid);
    expect(updatedEnemyFamiliar.currentHp).toBe(90 - 25);
    expect(updatedPlayerFamiliar.currentHp).toBe(60);
  });

  it('frost_bomb damages and slows the enemy', () => {
    const enemy = makeEnemy();
    const { playerResult, updatedEnemyFamiliar } = useItem(getItem('frost_bomb')!, makePlayer(), enemy);
    expect(updatedEnemyFamiliar.currentHp).toBe(90 - 15);
    const debuff = updatedEnemyFamiliar.statusEffects.find((e) => e.abilityId === 'frost_bomb');
    expect(debuff).toBeDefined();
    expect(debuff!.type).toBe(EffectType.Debuff);
    expect(debuff!.stat).toBe(StatName.Speed);
    expect(debuff!.value).toBe(0.7);
    // Statuses applied during a turn are NOT ticked on the application turn
    // (symmetric freshness rule), so the debuff keeps its full 2 turns and
    // first decrements at the end of the NEXT turn.
    expect(debuff!.turnsRemaining).toBe(2);
    expect(playerResult.description).toContain('-30% enemy Speed');
  });

  it('tonic cleanses debuffs and dots but keeps buffs', () => {
    const debuff = {
      abilityId: 'shadowstrike',
      type: EffectType.Debuff,
      stat: StatName.Defense,
      value: 0.8,
      turnsRemaining: 2,
    };
    const dot = { abilityId: 'burn', type: EffectType.Dot, stat: StatName.Hp, value: 1, turnsRemaining: 2 };
    const buff = { abilityId: 'sturdy', type: EffectType.Buff, stat: StatName.Defense, value: 1.2, turnsRemaining: 2 };
    const player = makePlayer({ statusEffects: [debuff, dot, buff] });
    const { updatedPlayerFamiliar } = useItem(getItem('tonic')!, player);
    const ids = updatedPlayerFamiliar.statusEffects.map((e) => e.abilityId);
    expect(ids).not.toContain('shadowstrike');
    expect(ids).not.toContain('burn');
    expect(ids).toContain('sturdy');
  });

  it('state-level effects are no-ops inside the engine (backend applies them)', () => {
    const { playerResult, updatedPlayerFamiliar, updatedEnemyFamiliar } = useItem(getItem('lucky_coin')!);
    expect(updatedPlayerFamiliar.currentHp).toBe(60);
    expect(updatedEnemyFamiliar.currentHp).toBe(90);
    expect(playerResult.description).toContain('Lucky Coin');
  });
});
