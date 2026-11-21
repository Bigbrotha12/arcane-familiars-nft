import { Affinity, scaleFamiliarStats, type FamiliarData } from '@arcane-familiars/game-logic';
import type { FamiliarState } from '../events';

/**
 * HUD view of a party member. Stats are level-scaled here because the save
 * stores level-aware HP/MP (dungeon.partyHp) while the familiar data is the
 * level-1 kit; without scaling, a levelled familiar showed e.g. HP 182/140.
 * Callers overwrite hp/mp with the live values when they have them.
 */
export function toFamiliarStateFromData(fd: FamiliarData, level = 1): FamiliarState {
  const stats = scaleFamiliarStats(fd.stats, level);
  return {
    id: fd.id,
    name: fd.name,
    hp: stats.hp,
    maxHp: stats.maxHp,
    mp: stats.mp,
    maxMp: stats.maxMp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    arcane: stats.arcane,
    affinity: Affinity[fd.affinity] ?? String(fd.affinity),
    level,
  };
}

/**
 * Sort room ids numerically when possible (room_0, room_1, ...),
 * falling back to lexicographic order for non-numeric ids.
 */
export function sortRoomIds(roomIds: string[]): string[] {
  return [...roomIds].sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
}
