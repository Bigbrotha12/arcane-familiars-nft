import type { BattleFamiliar, BattleState, GameState } from '@arcane-familiars/game-logic';

export interface ActiveBattle {
  battleId: string;
  battle: BattleState;
  row: { battle_json: string };
}

/**
 * Load a player's single active battle. The unique index guarantees at most one.
 * Returns null when there is no battle row.
 */
export async function loadActiveBattle(
  db: D1Database,
  anonymousId: string,
): Promise<ActiveBattle | null> {
  const row = await db
    .prepare('SELECT battle_id, battle_json FROM active_battles WHERE anonymous_id = ? LIMIT 1')
    .bind(anonymousId)
    .first<{ battle_id: string; battle_json: string }>();

  if (!row) return null;

  return {
    battleId: row.battle_id,
    battle: JSON.parse(row.battle_json) as BattleState,
    row,
  };
}

export async function deleteActiveBattle(db: D1Database, anonymousId: string): Promise<void> {
  await db
    .prepare('DELETE FROM active_battles WHERE anonymous_id = ?')
    .bind(anonymousId)
    .run();
}

/**
 * Write a combatant's final HP/MP into the dungeon's per-member resource tables
 * so leaving, abandoning, or swapping preserves attrition.
 */
export function persistCombatantResources(
  dungeon: GameState['dungeon'],
  familiar: BattleFamiliar,
): void {
  if (!dungeon) return;
  // Older saves predate the per-member resource maps. Backfill lazily so the
  // battle route cannot 500 on a legacy save.
  if (!dungeon.partyHp) dungeon.partyHp = {};
  if (!dungeon.partyMp) dungeon.partyMp = {};
  dungeon.partyHp[familiar.familiarData.id] = Math.max(0, familiar.currentHp);
  dungeon.partyMp[familiar.familiarData.id] = Math.max(0, familiar.currentMp);
}
