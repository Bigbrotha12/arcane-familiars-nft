import { ActionType, BattleResult, type BattleAction, type BattleFamiliar, type BattleState } from '@/types/battle';
import type { DungeonState } from '@/types/exploration';
import { getAbility, EffectType, Target } from '@/data/abilities';
import { getItem, ItemType, type ItemData } from '@/data/items';
import { validateMove } from '@/utils/dungeonEngine';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Whether an item can do anything at all for the active familiar. Used to stop
 * a full-HP potion (or full-MP ether) from being consumed for zero effect.
 * `partyHp` is optional because the validation layer does not always have the
 * dungeon state; when omitted, revive items are assumed useful and the backend
 * performs the real check before consumption.
 */
export function isItemUseful(item: ItemData, familiar: BattleFamiliar, partyHp?: Record<string, number>): boolean {
  const maxHp = familiar.familiarData.stats.maxHp;
  const maxMp = familiar.familiarData.stats.maxMp;

  for (const effect of item.effects) {
    switch (effect.kind) {
      case 'heal_hp':
      case 'heal_percentage':
        if (familiar.currentHp < maxHp) return true;
        break;
      case 'heal_mp':
        if (familiar.currentMp < maxMp) return true;
        break;
      case 'damage':
      case 'buff':
      case 'debuff':
      case 'grant_currency':
        return true;
      case 'dot':
        return true;
      case 'hot':
        if (familiar.currentHp < maxHp) return true;
        break;
      case 'cure_status':
        if (familiar.statusEffects.some((e) => e.type === EffectType.Debuff || e.type === EffectType.Dot)) {
          return true;
        }
        break;
      case 'revive_party':
        if (!partyHp) return true;
        if (Object.values(partyHp).some((hp) => hp <= 0)) return true;
        break;
    }
  }

  return false;
}

function validateTarget(action: BattleAction, battleState: BattleState): ValidationResult {
  if (!action.targetId) return { valid: true };

  const playerUid = battleState.playerFamiliar.uid;
  const enemyUid = battleState.enemyFamiliar.uid;
  let expectedUid: string;

  if (action.type === ActionType.Attack) {
    expectedUid = enemyUid;
  } else if (action.type === ActionType.Ability && action.abilityId) {
    const ability = getAbility(action.abilityId);
    expectedUid = ability?.target === Target.Enemy ? enemyUid : playerUid;
  } else {
    // Items, defend, and run are self-directed.
    expectedUid = playerUid;
  }

  if (action.targetId !== expectedUid) {
    return { valid: false, error: 'Invalid target' };
  }
  return { valid: true };
}

/**
 * Validate a battle action against the current battle state.
 */
export function validateBattleAction(
  action: BattleAction,
  battleState: BattleState,
  partyHp?: Record<string, number>
): ValidationResult {
  if (battleState.status !== BattleResult.Active) {
    return { valid: false, error: 'Battle is not active' };
  }

  switch (action.type) {
    case ActionType.Attack: {
      const targetCheck = validateTarget(action, battleState);
      if (!targetCheck.valid) return targetCheck;
      return { valid: true };
    }

    case ActionType.Ability: {
      if (!action.abilityId) {
        return { valid: false, error: 'Ability ID is required' };
      }
      const ability = getAbility(action.abilityId);
      if (!ability) {
        return { valid: false, error: `Unknown ability: ${action.abilityId}` };
      }
      if (battleState.playerFamiliar.currentMp < ability.mpCost) {
        return {
          valid: false,
          error: `Not enough MP. Need ${ability.mpCost}, have ${battleState.playerFamiliar.currentMp}`,
        };
      }
      const cooldown = battleState.playerFamiliar.cooldowns[action.abilityId] || 0;
      if (cooldown > 0) {
        return { valid: false, error: `Ability on cooldown for ${cooldown} turns` };
      }
      const targetCheck = validateTarget(action, battleState);
      if (!targetCheck.valid) return targetCheck;
      return { valid: true };
    }

    case ActionType.Defend: {
      const targetCheck = validateTarget(action, battleState);
      if (!targetCheck.valid) return targetCheck;
      return { valid: true };
    }

    case ActionType.Item: {
      if (!action.itemId) {
        return { valid: false, error: 'Item ID is required' };
      }
      const item = getItem(action.itemId);
      if (!item || item.type !== ItemType.Consumable) {
        return { valid: false, error: `Unknown or non-consumable item: ${action.itemId}` };
      }
      const targetCheck = validateTarget(action, battleState);
      if (!targetCheck.valid) return targetCheck;

      const hasRevive = item.effects.some((e) => e.kind === 'revive_party');
      if (hasRevive && partyHp && !Object.values(partyHp).some((hp) => hp <= 0)) {
        return { valid: false, error: 'No fainted party members to revive' };
      }
      if (!isItemUseful(item, battleState.playerFamiliar, partyHp)) {
        return { valid: false, error: 'Item would have no effect' };
      }
      return { valid: true };
    }

    case ActionType.Run: {
      if (battleState.isBoss) {
        return { valid: false, error: 'Cannot run from a boss battle' };
      }
      const targetCheck = validateTarget(action, battleState);
      if (!targetCheck.valid) return targetCheck;
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown action type: ${action.type}` };
  }
}

/**
 * Validate a dungeon exploration move.
 */
export function validateDungeonExplore(roomId: string, dungeonState: DungeonState): ValidationResult {
  const currentRoom = dungeonState.rooms[dungeonState.currentRoomId];
  if (!currentRoom) {
    return { valid: false, error: 'Current room not found' };
  }

  const targetRoom = dungeonState.rooms[roomId];
  if (!targetRoom) {
    return { valid: false, error: 'Target room not found' };
  }

  if (!validateMove(currentRoom, roomId)) {
    return { valid: false, error: 'Cannot move to that room from current position' };
  }

  return { valid: true };
}

/**
 * Validate a party composition.
 */
export function validateParty(party: string[], collection: string[]): ValidationResult {
  if (party.length !== 2) {
    return { valid: false, error: 'Party must have exactly 2 familiars' };
  }

  if (party[0] === party[1]) {
    return { valid: false, error: 'Cannot have duplicate familiars in party' };
  }

  for (const familiarId of party) {
    if (!collection.includes(familiarId)) {
      return { valid: false, error: `You don't own familiar: ${familiarId}` };
    }
  }

  return { valid: true };
}
