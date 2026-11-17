import { getFamiliar } from '@/data/familiars';
import type { ItemData, ItemEffectSpec } from '@/data/items';
import type { DungeonState } from '@/types/exploration';
import { scaleFamiliarStats } from '@/utils/progression';

/** Effect kinds that make sense outside battle: healing and reviving only. */
const FIELD_EFFECT_KINDS = new Set<ItemEffectSpec['kind']>(['heal_hp', 'heal_mp', 'heal_percentage', 'revive_party']);

/**
 * Whether an item can be used while exploring. Bombs, buffs, debuffs, dots,
 * hots, cures and currency items stay battle-only.
 */
export function isFieldUsableItem(item: ItemData): boolean {
  return item.effects.length > 0 && item.effects.every((effect) => FIELD_EFFECT_KINDS.has(effect.kind));
}

/**
 * HP or MP restored by one healing effect, capped at the target's missing pool.
 * Shared by the battle engine and out-of-battle field use so both use the same
 * math. `multiplier` carries the battle-only Tidecaller passive; field use
 * leaves it at 1.
 */
export function itemHealAmount(effect: ItemEffectSpec, current: number, max: number, multiplier = 1): number {
  switch (effect.kind) {
    case 'heal_hp':
      return Math.max(0, Math.min(max - current, Math.round(effect.value * multiplier)));
    case 'heal_percentage':
      return Math.max(0, Math.min(max - current, Math.round(((max * effect.percentage) / 100) * multiplier)));
    case 'heal_mp':
      return Math.max(0, Math.min(max - current, effect.value));
    default:
      return 0;
  }
}

export interface ItemHealAmounts {
  hp: number;
  mp: number;
}

/**
 * Total HP/MP an item's healing effects restore. Effects are applied in order,
 * so multiple heals on one item cannot exceed the target's max.
 */
export function computeItemHeal(
  effects: readonly ItemEffectSpec[],
  current: ItemHealAmounts,
  max: ItemHealAmounts,
  hpMultiplier = 1
): ItemHealAmounts {
  let hp = 0;
  let mp = 0;

  for (const effect of effects) {
    if (effect.kind === 'heal_mp') {
      mp += itemHealAmount(effect, current.mp + mp, max.mp);
      continue;
    }
    const amount = itemHealAmount(effect, current.hp + hp, max.hp, hpMultiplier);
    if (amount > 0) hp += amount;
  }

  return { hp, mp };
}

export interface RevivedPartyMember {
  familiarId: string;
  hp: number;
}

/**
 * Revive every KO'd party member at `percentage` of their level-scaled max HP.
 * Mutates `dungeon.partyHp` and returns who was revived. Shared by battle item
 * use and field use so both revive identically.
 */
export function reviveFaintedParty(
  dungeon: Pick<DungeonState, 'party' | 'partyHp'>,
  familiarLevels: Record<string, number> | undefined,
  percentage: number
): RevivedPartyMember[] {
  const revived: RevivedPartyMember[] = [];

  for (const familiarId of dungeon.party) {
    if ((dungeon.partyHp[familiarId] ?? 0) > 0) continue;
    const data = getFamiliar(familiarId);
    if (!data) continue;
    // Scale by the familiar's own level: reviving a levelled party member to
    // level-1 base HP would weaken it.
    const maxHp = scaleFamiliarStats(data.stats, familiarLevels?.[familiarId] ?? 1).maxHp;
    const hp = Math.max(1, Math.floor((maxHp * percentage) / 100));
    dungeon.partyHp[familiarId] = hp;
    revived.push({ familiarId, hp });
  }

  return revived;
}
