import { describe, it, expect } from 'vitest';
import { reconcileActiveBattle, resolveBattleRoomId } from '../activeRun';
import { generateDungeon } from '../dungeonEngine';
import { AREAS } from '../../data/areas';
import { getFamiliar } from '../../data/familiars';
import { BattleResult } from '../../types/battle';
import type { BattleState } from '../../types/battle';
import type { DungeonState } from '../../types/exploration';

function createDungeon(): DungeonState {
  return generateDungeon(AREAS.verdantMeadow, 42);
}

function createBattle(roomId: string, overrides: Partial<BattleState> = {}): BattleState {
  const player = getFamiliar('whiteDog')!;
  const enemy = getFamiliar('sparkMouse')!;
  return {
    id: 'battle-1',
    roomId,
    playerFamiliar: {
      uid: 'player',
      familiarData: player,
      currentHp: player.stats.hp,
      currentMp: player.stats.mp,
      statusEffects: [],
      cooldowns: {},
      isAlly: true,
    },
    enemyFamiliar: {
      uid: 'enemy',
      familiarData: enemy,
      currentHp: enemy.stats.hp,
      currentMp: enemy.stats.mp,
      statusEffects: [],
      cooldowns: {},
      isAlly: false,
    },
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    ...overrides,
  };
}

describe('reconcileActiveBattle', () => {
  it('returns none when there is no battle', () => {
    expect(reconcileActiveBattle(createDungeon(), null).action).toBe('none');
  });

  it('deletes a finished battle', () => {
    const dungeon = createDungeon();
    const battle = createBattle(dungeon.currentRoomId, { status: BattleResult.Won });
    expect(reconcileActiveBattle(dungeon, battle)).toEqual({
      action: 'delete',
      reason: 'battle finished',
    });
  });

  it('deletes a battle with no dungeon', () => {
    expect(reconcileActiveBattle(null, createBattle('room_1'))).toEqual({
      action: 'delete',
      reason: 'no active dungeon',
    });
  });

  it('deletes a battle whose room is missing', () => {
    expect(reconcileActiveBattle(createDungeon(), createBattle('room_999'))).toEqual({
      action: 'delete',
      reason: 'room missing',
    });
  });

  it('deletes a battle whose encounter is already resolved', () => {
    const dungeon = createDungeon();
    dungeon.rooms[dungeon.currentRoomId].pendingEncounter = {
      enemyId: 'sparkMouse',
      resolved: true,
      level: 1,
    };
    expect(reconcileActiveBattle(dungeon, createBattle(dungeon.currentRoomId))).toEqual({
      action: 'delete',
      reason: 'encounter resolved',
    });
  });

  it('resumes an active battle in the fought room', () => {
    const dungeon = createDungeon();
    const roomId = Object.keys(dungeon.rooms)[1];
    dungeon.rooms[roomId].pendingEncounter = {
      enemyId: 'sparkMouse',
      resolved: false,
      level: 1,
    };
    expect(reconcileActiveBattle(dungeon, createBattle(roomId))).toEqual({
      action: 'resume',
    });
  });
});

describe('resolveBattleRoomId', () => {
  it('returns the battle room when it exists', () => {
    const dungeon = createDungeon();
    const roomId = Object.keys(dungeon.rooms)[1];
    expect(resolveBattleRoomId(dungeon, createBattle(roomId))).toBe(roomId);
  });

  it('falls back to the current room for legacy battles without roomId', () => {
    const dungeon = createDungeon();
    const battle = createBattle(dungeon.currentRoomId);
    delete battle.roomId;
    expect(resolveBattleRoomId(dungeon, battle)).toBe(dungeon.currentRoomId);
  });

  it('returns null when the battle room no longer exists', () => {
    const dungeon = createDungeon();
    expect(resolveBattleRoomId(dungeon, createBattle('room_999'))).toBeNull();
  });

  it('returns null without a dungeon', () => {
    expect(resolveBattleRoomId(null, createBattle('room_1'))).toBeNull();
  });
});
