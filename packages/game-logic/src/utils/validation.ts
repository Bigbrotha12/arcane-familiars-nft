import { ActionType, BattleResult, type BattleAction, type BattleState } from '@/types/battle';
import type { DungeonState } from '@/types/exploration';
import { getAbility } from '@/data/abilities';
import { validateMove } from '@/utils/dungeonEngine';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a battle action against the current battle state.
 */
export function validateBattleAction(action: BattleAction, battleState: BattleState): ValidationResult {
  if (battleState.status !== BattleResult.Active) {
    return { valid: false, error: 'Battle is not active' };
  }

  switch (action.type) {
    case ActionType.Attack:
      return { valid: true };

    case ActionType.Ability: {
      if (!action.abilityId) {
        return { valid: false, error: 'Ability ID is required' };
      }
      const ability = getAbility(action.abilityId);
      if (!ability) {
        return { valid: false, error: `Unknown ability: ${action.abilityId}` };
      }
      if (battleState.playerFamiliar.currentMp < ability.mpCost) {
        return { valid: false, error: `Not enough MP. Need ${ability.mpCost}, have ${battleState.playerFamiliar.currentMp}` };
      }
      const cooldown = battleState.playerFamiliar.cooldowns[action.abilityId] || 0;
      if (cooldown > 0) {
        return { valid: false, error: `Ability on cooldown for ${cooldown} turns` };
      }
      return { valid: true };
    }

    case ActionType.Defend:
      return { valid: true };

    case ActionType.Item: {
      if (!action.itemId) {
        return { valid: false, error: 'Item ID is required' };
      }
      return { valid: true };
    }

    case ActionType.Run: {
      if (battleState.isBoss) {
        return { valid: false, error: 'Cannot run from a boss battle' };
      }
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
