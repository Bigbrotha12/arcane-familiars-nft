import { Affinity, type FamiliarData } from '@arcane-familiars/game-logic';
import type { FamiliarState } from '../events';

export function toFamiliarStateFromData(fd: FamiliarData): FamiliarState {
  return {
    id: fd.id,
    name: fd.name,
    hp: fd.stats.hp,
    maxHp: fd.stats.maxHp,
    mp: fd.stats.mp,
    maxMp: fd.stats.maxMp,
    attack: fd.stats.attack,
    defense: fd.stats.defense,
    speed: fd.stats.speed,
    arcane: fd.stats.arcane,
    affinity: Affinity[fd.affinity] ?? String(fd.affinity),
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
