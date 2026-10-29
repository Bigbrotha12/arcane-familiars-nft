import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers/worker';

const PLAYER = 'player-1';
const PARTY = ['whiteDog', 'yellowFighter'];

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.dispose();
});

async function readState(): Promise<any> {
  const row = await env.db
    .prepare('SELECT state_json, version FROM game_states WHERE anonymous_id = ?')
    .bind(PLAYER)
    .first();
  return { state: JSON.parse(row.state_json), version: row.version };
}

async function patchState(mutator: (state: any) => void): Promise<void> {
  const { state, version } = await readState();
  mutator(state);
  await env.db
    .prepare('UPDATE game_states SET state_json = ?, version = version + 1 WHERE anonymous_id = ? AND version = ?')
    .bind(JSON.stringify(state), PLAYER, version)
    .run();
}

async function readBattle(): Promise<any> {
  const { state } = await readState();
  return state.activeBattle ? { battleId: state.activeBattle.id, battle: state.activeBattle } : null;
}

async function patchBattle(mutator: (battle: any) => void): Promise<void> {
  const { state, version } = await readState();
  if (!state.activeBattle) throw new Error('No active battle to patch');
  mutator(state.activeBattle);
  await env.db
    .prepare('UPDATE game_states SET state_json = ?, version = version + 1 WHERE anonymous_id = ? AND version = ?')
    .bind(JSON.stringify(state), PLAYER, version)
    .run();
}

async function createRun(): Promise<any> {
  const load = await env.post('/api/game/state/load', { anonymousId: PLAYER });
  expect(load.status).toBe(200);

  const party = await env.post('/api/game/state/party', { anonymousId: PLAYER, activeParty: PARTY });
  expect(party.status).toBe(200);

  const enter = await env.post('/api/game/dungeon/enter', { anonymousId: PLAYER, areaId: 'verdantMeadow' });
  expect(enter.status).toBe(200);
  return enter.body.dungeon;
}

async function setupEncounter(roomId = 'room_1'): Promise<void> {
  await patchState((state) => {
    const room = state.dungeon.rooms[roomId];
    room.cleared = true;
    room.pendingEncounter = { enemyId: 'sparkMouse', resolved: false, level: 1 };
    state.dungeon.currentRoomId = roomId;
  });
}

async function startBattle(): Promise<any> {
  const start = await env.post('/api/game/battle/start', {
    anonymousId: PLAYER,
    playerFamiliarId: 'whiteDog',
  });
  expect(start.status).toBe(200);
  return start.body.battle;
}

async function makeBattleWinnable(): Promise<void> {
  await patchBattle((battle) => {
    battle.enemyFamiliar.currentHp = 1;
    battle.enemyFamiliar.familiarData.stats.speed = 1;
    battle.enemyFamiliar.familiarData.stats.hp = 1;
    battle.playerFamiliar.familiarData.stats.speed = 999;
  });
}

describe('battle state integrity', () => {
  it('rejects a second start while a battle is active', async () => {
    await createRun();
    await setupEncounter();
    const battle = await startBattle();
    expect(battle.roomId).toBe('room_1');

    const again = await env.post('/api/game/battle/start', {
      anonymousId: PLAYER,
      playerFamiliarId: 'whiteDog',
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('BATTLE_ACTIVE');
  });

  it('resolves the fought room, not the current room', async () => {
    await createRun();
    await setupEncounter('room_1');
    await startBattle();
    await makeBattleWinnable();

    // Simulate the old exploit: move the current room while the battle is live.
    await patchState((state) => {
      const room = state.dungeon.rooms.room_2;
      room.cleared = true;
      room.pendingEncounter = { enemyId: 'leafBunny', resolved: false, level: 1 };
      state.dungeon.currentRoomId = 'room_2';
    });

    const action = await env.post('/api/game/battle/action', {
      anonymousId: PLAYER,
      battleId: (await readBattle()).battleId,
      action: { type: 0 },
      expectedTurnCount: 0,
    });
    expect(action.status).toBe(200);
    const { state } = await readState();
    expect(state.dungeon.rooms.room_1.pendingEncounter.resolved).toBe(true);
    expect(state.dungeon.rooms.room_2.pendingEncounter.resolved).toBe(false);
  });

  it('does not apply a concurrent action twice', async () => {
    await createRun();
    await setupEncounter();
    await startBattle();
    await makeBattleWinnable();
    const active = await readBattle();

    const results = await Promise.all([
      env.post('/api/game/battle/action', {
        anonymousId: PLAYER,
        battleId: active.battleId,
        action: { type: 0 },
        expectedTurnCount: 0,
      }),
      env.post('/api/game/battle/action', {
        anonymousId: PLAYER,
        battleId: active.battleId,
        action: { type: 0 },
        expectedTurnCount: 0,
      }),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([404, 409]).toContain(statuses[1]);
    const { state } = await readState();
    expect(state.winCount).toBe(1);
    expect(await readBattle()).toBeNull();
  });

  it('persists combat HP on abandon and removes the row', async () => {
    await createRun();
    await setupEncounter();
    await startBattle();
    await patchBattle((battle) => {
      battle.playerFamiliar.currentHp = 42;
      battle.playerFamiliar.currentMp = 17;
    });
    const active = await readBattle();

    const abandon = await env.post('/api/game/battle/abandon', {
      anonymousId: PLAYER,
      battleId: active.battleId,
      expectedTurnCount: 0,
    });
    expect(abandon.status).toBe(200);
    expect(abandon.body.forfeited).toBe(false);

    expect(await readBattle()).toBeNull();
    const { state } = await readState();
    expect(state.dungeon.partyHp.whiteDog).toBe(42);
    expect(state.dungeon.partyMp.whiteDog).toBe(17);
  });

  it('deletes an active battle when exiting the dungeon', async () => {
    await createRun();
    await setupEncounter();
    await startBattle();

    const exit = await env.post('/api/game/dungeon/exit', { anonymousId: PLAYER });
    expect(exit.status).toBe(200);
    expect(await readBattle()).toBeNull();
    const { state } = await readState();
    expect(state.dungeon).toBeNull();
  });

  it('rejects a second exploration while a battle is active', async () => {
    await createRun();
    await setupEncounter();
    await startBattle();

    const explore = await env.post('/api/game/dungeon/explore', {
      anonymousId: PLAYER,
      roomId: 'room_2',
    });
    expect(explore.status).toBe(409);
    expect(explore.body.code).toBe('BATTLE_ACTIVE');
  });

  it('rejects a 0-HP lead at battle start', async () => {
    await createRun();
    await setupEncounter();
    await patchState((state) => {
      state.dungeon.partyHp.whiteDog = 0;
    });

    const start = await env.post('/api/game/battle/start', {
      anonymousId: PLAYER,
      playerFamiliarId: 'whiteDog',
    });
    expect(start.status).toBe(400);
    expect(start.body.code).toBe('FAMILIAR_FAINTED');
  });

  it('rejects a full-HP potion without consuming it', async () => {
    await createRun();
    await setupEncounter();
    await startBattle();
    const active = await readBattle();

    const action = await env.post('/api/game/battle/action', {
      anonymousId: PLAYER,
      battleId: active.battleId,
      action: { type: 3, itemId: 'potion_small' },
      expectedTurnCount: 0,
    });
    expect(action.status).toBe(400);
    expect(action.body.error).toBe('Item would have no effect');

    const { state } = await readState();
    expect(state.inventory.items.find((i: any) => i.itemId === 'potion_small').quantity).toBe(3);
  });

  it('rejects an attack targeted at the player', async () => {
    await createRun();
    await setupEncounter();
    const battle = await startBattle();

    const action = await env.post('/api/game/battle/action', {
      anonymousId: PLAYER,
      battleId: battle.id,
      action: { type: 0, targetId: battle.playerFamiliar.uid },
      expectedTurnCount: 0,
    });
    expect(action.status).toBe(400);
    expect(action.body.error).toBe('Invalid target');
  });

  it('cleans an orphaned battle on bootstrap', async () => {
    await createRun();
    await setupEncounter();
    await startBattle();
    await patchState((state) => {
      state.dungeon = null;
    });

    const boot = await env.get(`/api/game/bootstrap?anonymousId=${PLAYER}`);
    expect(boot.status).toBe(200);
    expect(boot.body.battle).toBeNull();
    expect(await readBattle()).toBeNull();
  });
});
