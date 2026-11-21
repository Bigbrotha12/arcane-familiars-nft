import { describe, expect, it } from 'vitest';
import type { GameStateSnapshot, FamiliarState } from '@/game';
import { detectTips, isOverlayActive, mergeTipQueue, nextTip, TIPS, type TipId } from './tipRules';

function familiar(overrides: Partial<FamiliarState> = {}): FamiliarState {
  return {
    id: 'whiteDog',
    name: 'White Dog',
    hp: 20,
    maxHp: 20,
    mp: 5,
    maxMp: 10,
    attack: 5,
    defense: 5,
    speed: 5,
    arcane: 5,
    affinity: 'ember',
    ...overrides,
  };
}

function snapshot(overrides: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return {
    familiars: [familiar()],
    currency: 0,
    battleCount: 0,
    wins: 0,
    currentScene: 'world_map',
    ...overrides,
  };
}

const battle = (overrides: Partial<GameStateSnapshot> = {}) =>
  snapshot({ currentScene: 'battle', phase: 'menu', enemy: familiar(), ...overrides });

const charm = { baseId: 'emberBand', rarity: 'common' as const, mods: [] };

describe('detectTips', () => {
  it('triggers the exploration tip only inside a dungeon', () => {
    expect(detectTips(snapshot({ currentScene: 'exploration' }))).toEqual([]);
    expect(
      detectTips(
        snapshot({
          currentScene: 'exploration',
          dungeon: {
            areaId: 'verdantMeadow',
            currentRoomId: 'room_0',
            currentRoomIndex: 0,
            roomCount: 1,
            visitedRoomIds: ['room_0'],
            rooms: [],
          },
        })
      )
    ).toEqual(['explore']);
  });

  it('triggers the encounter and elite tips from the pending overlay', () => {
    expect(detectTips(snapshot({ currentScene: 'exploration', encounterActive: true }))).toEqual(['encounter']);
    expect(
      detectTips(
        snapshot({
          currentScene: 'exploration',
          encounterActive: true,
          pendingEncounter: {
            enemyId: 'whiteDog',
            level: 3,
            isBoss: false,
            elite: { id: 'armored', name: 'Armored White Dog', description: 'Defense ×1.5' },
          },
        })
      )
    ).toEqual(['encounter', 'elite']);
  });

  it('triggers battle tips from action-bar, charge, swap and relay state', () => {
    expect(detectTips(battle())).toEqual(['battleStart']);
    expect(detectTips(battle({ enemy: familiar({ charged: true }) }))).toEqual(['battleStart', 'charge']);
    expect(detectTips(battle({ canSwap: true }))).toEqual(['battleStart', 'swap']);
    expect(detectTips(battle({ forcedSwap: true }))).toEqual(['battleStart', 'knockout']);
    expect(detectTips(battle({ enemy: familiar({ elite: 'swift' }) }))).toEqual(['battleStart', 'elite']);
  });

  it('triggers treasure, curio and charm tips from their overlays', () => {
    expect(detectTips(snapshot({ currentScene: 'exploration', treasureActive: true }))).toEqual(['treasure']);
    expect(
      detectTips(
        snapshot({
          currentScene: 'exploration',
          treasureActive: true,
          treasure: { tier: 'common', items: [], currency: 0, charm },
        })
      )
    ).toEqual(['treasure', 'charm']);
    expect(
      detectTips(
        snapshot({
          currentScene: 'exploration',
          curio: { id: 'statue', name: 'Statue', description: '', options: [] },
        })
      )
    ).toEqual(['curio']);
    expect(
      detectTips(
        snapshot({
          currentScene: 'exploration',
          curioResult: { text: '', gains: [], charms: [charm] },
        })
      )
    ).toEqual(['curio', 'charm']);
  });

  it('triggers growth, recruit and charm tips from battle rewards', () => {
    expect(
      detectTips(
        battle({
          phase: 'outcome',
          battleOutcome: { outcome: 'victory', rewards: { currency: 0, items: [], levelUp: 1 } },
        })
      )
    ).toEqual(['levelUp']);
    expect(
      detectTips(
        battle({
          phase: 'outcome',
          battleOutcome: {
            outcome: 'victory',
            rewards: { currency: 0, items: [], recruitedFamiliar: 'whiteDog', recruitedName: 'White Dog' },
          },
        })
      )
    ).toEqual(['recruit']);
    expect(
      detectTips(
        battle({
          phase: 'outcome',
          battleOutcome: {
            outcome: 'victory',
            rewards: { currency: 0, items: [], bossChest: { items: [], currency: 0, charm } },
          },
        })
      )
    ).toEqual(['charm']);
  });

  it('triggers defeat and world-map tips from outcomes and history', () => {
    expect(detectTips(battle({ phase: 'outcome', battleOutcome: { outcome: 'defeat' } }))).toEqual(['defeat']);
    expect(detectTips(snapshot({ currentScene: 'world_map', battleCount: 1 }))).toEqual(['worldMap']);
    expect(detectTips(snapshot())).toEqual([]);
  });

  it('keeps the declared table order', () => {
    expect(TIPS.map((tip) => tip.id)).toEqual([
      'explore',
      'encounter',
      'battleStart',
      'charge',
      'swap',
      'knockout',
      'treasure',
      'curio',
      'elite',
      'levelUp',
      'recruit',
      'charm',
      'defeat',
      'worldMap',
    ]);
  });
});

describe('queue helpers', () => {
  it('sorts newly detected tips by table order', () => {
    expect(mergeTipQueue([], ['worldMap', 'explore', 'encounter'], new Set(), null)).toEqual([
      'explore',
      'encounter',
      'worldMap',
    ]);
  });

  it('never queues a seen, current or already queued tip', () => {
    expect(mergeTipQueue(['explore'], ['explore', 'encounter'], new Set(['encounter']), null)).toEqual(['explore']);
    expect(mergeTipQueue([], ['explore', 'encounter'], new Set(), 'encounter')).toEqual(['explore']);
    expect(mergeTipQueue([], ['explore', 'encounter'], new Set(['explore', 'encounter']), null)).toEqual([]);
  });

  it('returns the same queue when nothing new was detected', () => {
    const queue: TipId[] = ['explore'];
    expect(mergeTipQueue(queue, ['explore'], new Set(), null)).toBe(queue);
  });

  it('picks the head of the queue unless an overlay is blocking', () => {
    expect(nextTip(['encounter', 'battleStart'], false, ['encounter', 'battleStart'])).toBe('encounter');
    expect(nextTip([], false, ['explore'])).toBeNull();
  });

  it('shows overlay tips with their overlay and holds the rest', () => {
    expect(nextTip(['explore', 'encounter'], true, ['explore', 'encounter'])).toBe('encounter');
    expect(nextTip(['explore'], true, ['explore'])).toBeNull();
  });

  it('skips tips whose situation has passed', () => {
    // The encounter overlay closed (battle started): the encounter tip waits for the next encounter.
    expect(nextTip(['encounter', 'battleStart'], false, ['battleStart'])).toBe('battleStart');
    expect(nextTip(['encounter'], false, [])).toBeNull();
  });
});

describe('isOverlayActive', () => {
  it('blocks tips while a described overlay owns the screen', () => {
    expect(isOverlayActive(snapshot({ currentScene: 'exploration', encounterActive: true }))).toBe(true);
    expect(isOverlayActive(snapshot({ currentScene: 'exploration', treasureActive: true }))).toBe(true);
    expect(isOverlayActive(battle({ phase: 'outcome' }))).toBe(true);
  });

  it('allows tips during normal play', () => {
    expect(isOverlayActive(snapshot({ currentScene: 'exploration' }))).toBe(false);
    expect(isOverlayActive(battle({ phase: 'menu' }))).toBe(false);
    expect(isOverlayActive(battle({ phase: 'acting' }))).toBe(false);
  });
});
