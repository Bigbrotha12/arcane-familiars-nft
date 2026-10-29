import { BattleResult, type BattleState } from '@/types/battle';
import type { DungeonState } from '@/types/exploration';

export type ActiveBattleAction = 'none' | 'resume' | 'delete';

export interface ActiveBattleDecision {
  action: ActiveBattleAction;
  reason?: string;
}

/**
 * Decide what bootstrap should do with a persisted battle row. This is pure so
 * the full matrix can be unit-tested without D1; the route only applies the
 * decision.
 */
export function reconcileActiveBattle(
  dungeon: DungeonState | null | undefined,
  battle: BattleState | null | undefined
): ActiveBattleDecision {
  if (!battle) return { action: 'none', reason: 'no battle' };
  if (battle.status !== BattleResult.Active) {
    return { action: 'delete', reason: 'battle finished' };
  }
  if (!dungeon) {
    return { action: 'delete', reason: 'no active dungeon' };
  }

  const roomId = resolveBattleRoomId(dungeon, battle);
  if (!roomId) {
    return { action: 'delete', reason: 'room missing' };
  }

  const room = dungeon.rooms[roomId];
  if (room?.pendingEncounter?.resolved) {
    return { action: 'delete', reason: 'encounter resolved' };
  }

  return { action: 'resume' };
}

/**
 * The room a battle belongs to. New battles always carry `roomId`; old rows
 * fall back to the player's current room. Returns null when neither exists.
 */
export function resolveBattleRoomId(
  dungeon: DungeonState | null | undefined,
  battle: BattleState | null | undefined
): string | null {
  if (!dungeon) return null;
  if (battle?.roomId && dungeon.rooms[battle.roomId]) return battle.roomId;
  if (battle?.roomId) return null;
  if (dungeon.rooms[dungeon.currentRoomId]) return dungeon.currentRoomId;
  return null;
}
