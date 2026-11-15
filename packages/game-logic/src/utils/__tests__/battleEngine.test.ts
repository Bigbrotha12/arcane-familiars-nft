import { describe, it, expect } from 'vitest';
import {
  getEffectiveStat,
  calculateDamage,
  applyStatusEffects,
  checkBattleOutcome,
  resolveTurn,
  updateCooldowns,
} from '../battleEngine';
import { seededRandom } from '../mathUtils';
import { getFamiliar } from '../../data/familiars';
import { ActionType, Outcome } from '../../types/battle';
import { EffectType, ScalingStat, StatName } from '../../data/abilities';
import { BALANCE } from '../../data/balance';
import type { BattleFamiliar, StatusEffect } from '../../types/battle';

function makeRng(seed = 42): () => number {
  return seededRandom(seed);
}

/** No crit, variance multiplier exactly 1 → every hit is deterministic. */
function steadyRng(): () => number {
  return () => 0.5;
}

/** RNG that returns the given rolls in order (falls back to 0.5). */
function rngSeq(...rolls: number[]): () => number {
  let i = 0;
  return () => rolls[i++] ?? 0.5;
}

interface DamageMods {
  crit?: boolean;
  variance?: number;
  affinity?: number;
  guard?: number;
  charged?: number;
}

/** Re-derivation of the documented damage rule, for expected values. */
function expectedDamage(attackerStat: number, defenderStat: number, multiplier: number, mods: DamageMods = {}): number {
  const { crit = false, variance = 1, affinity = 1, guard = 1, charged = 1 } = mods;
  const base = (attackerStat * multiplier * BALANCE.defenseScale) / (BALANCE.defenseScale + defenderStat);
  return Math.max(1, Math.round(base * affinity * (crit ? BALANCE.critMultiplier : 1) * variance * guard * charged));
}

let uidCounter = 0;

function makeFamiliar(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    uid: `player-${++uidCounter}`,
    familiarData: getFamiliar('whiteDog')!,
    currentHp: 120,
    currentMp: 80,
    statusEffects: [],
    cooldowns: {},
    isAlly: true,
    ...overrides,
  };
}

describe('getEffectiveStat', () => {
  it('returns base stat unchanged when no effects are active', () => {
    expect(getEffectiveStat(100, [], StatName.Attack)).toBe(100);
  });

  it('applies a single 1.5x buff', () => {
    const effects: StatusEffect[] = [
      { abilityId: 'sturdy', type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Defense)).toBe(150);
  });

  it('multiplies multiple buffs together', () => {
    const effects: StatusEffect[] = [
      { abilityId: 'a', type: EffectType.Buff, stat: StatName.Attack, value: 1.5, turnsRemaining: 2 },
      { abilityId: 'b', type: EffectType.Buff, stat: StatName.Attack, value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Attack)).toBe(225);
  });

  it('reduces stat for a debuff below 1', () => {
    const effects: StatusEffect[] = [
      { abilityId: 'shadowstrike', type: EffectType.Debuff, stat: StatName.Defense, value: 0.8, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Defense)).toBe(80);
  });

  it('returns minimum 1 even with a severe debuff on a low stat', () => {
    const effects: StatusEffect[] = [
      { abilityId: 'x', type: EffectType.Debuff, stat: StatName.Attack, value: 0.1, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(1, effects, StatName.Attack)).toBe(1);
  });

  it('only considers effects whose stat name matches', () => {
    const effects: StatusEffect[] = [
      { abilityId: 'sturdy', type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Attack)).toBe(100);
  });

  it('ignores dot and hot effects since they are not buff/debuff', () => {
    const effects: StatusEffect[] = [
      { abilityId: 'naturabless', type: EffectType.Hot, stat: StatName.Attack, value: 5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Attack)).toBe(100);
  });
});

describe('calculateDamage', () => {
  it('uses the defense-softened formula for a basic attack', () => {
    // whiteDog: attack 55, defense 70 → 55 * 100 / (100 + 70)
    const result = calculateDamage(makeFamiliar(), makeFamiliar(), 1.0, ScalingStat.Attack, steadyRng());
    expect(result.damage).toBe(expectedDamage(55, 70, 1.0));
    expect(result.isCritical).toBe(false);
    expect(result.effectiveness).toBe('neutral');
  });

  it('never hits a hard wall: more defense lowers damage without nullifying it', () => {
    const soft = makeFamiliar({
      familiarData: { ...getFamiliar('whiteDog')!, stats: { ...getFamiliar('whiteDog')!.stats, defense: 200 } },
    });
    const hard = makeFamiliar({
      familiarData: { ...getFamiliar('whiteDog')!, stats: { ...getFamiliar('whiteDog')!.stats, defense: 400 } },
    });
    const softHit = calculateDamage(makeFamiliar(), soft, 1.0, ScalingStat.Attack, steadyRng());
    const hardHit = calculateDamage(makeFamiliar(), hard, 1.0, ScalingStat.Attack, steadyRng());
    expect(softHit.damage).toBeGreaterThan(hardHit.damage);
    expect(hardHit.damage).toBeGreaterThan(0);
  });

  it('uses arcane stat for arcane-scaled abilities', () => {
    const result = calculateDamage(makeFamiliar(), makeFamiliar(), 2.0, ScalingStat.Arcane, steadyRng());
    // arcane 45, defense 70
    expect(result.damage).toBe(expectedDamage(45, 70, 2.0));
  });

  it('returns minimum 1 damage when defense is absurdly high', () => {
    const defender = makeFamiliar({
      familiarData: {
        ...getFamiliar('whiteDog')!,
        stats: { ...getFamiliar('whiteDog')!.stats, defense: 1_000_000 },
      },
    });
    const result = calculateDamage(makeFamiliar(), defender, 1.0, ScalingStat.Attack, steadyRng());
    expect(result.damage).toBe(1);
  });

  it('applies the critical multiplier when the first roll is below the crit chance', () => {
    // First draw is the crit roll, second the variance roll.
    const result = calculateDamage(
      makeFamiliar(),
      makeFamiliar(),
      1.0,
      ScalingStat.Attack,
      rngSeq(BALANCE.critChance - 0.01, 0.5)
    );
    expect(result.isCritical).toBe(true);
    expect(result.damage).toBe(expectedDamage(55, 70, 1.0, { crit: true }));
  });

  it('does not crit when the first roll is at or above the crit chance', () => {
    const result = calculateDamage(
      makeFamiliar(),
      makeFamiliar(),
      1.0,
      ScalingStat.Attack,
      rngSeq(BALANCE.critChance, 0.5)
    );
    expect(result.isCritical).toBe(false);
    expect(result.damage).toBe(expectedDamage(55, 70, 1.0));
  });

  it('always draws the crit roll and the variance roll, even when no crit fires', () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return 0.99;
    };
    calculateDamage(makeFamiliar(), makeFamiliar(), 1.0, ScalingStat.Attack, rng);
    expect(calls).toBe(2);
  });

  it('scales damage within the documented variance bounds', () => {
    // First draw is always the crit roll (no crit), second is the variance roll.
    const low = rngSeq(0.5, 0);
    const mid = rngSeq(0.5, 0.5);
    const high = rngSeq(0.5, 0.999999);
    const attacker = makeFamiliar();
    const defender = makeFamiliar();
    const dmg = (rng: () => number) => calculateDamage(attacker, defender, 1.0, ScalingStat.Attack, rng).damage;
    // Roll once per generator: each rng closure is stateful.
    const lowDamage = dmg(low);
    const midDamage = dmg(mid);
    const highDamage = dmg(high);
    expect(lowDamage).toBe(expectedDamage(55, 70, 1.0, { variance: 1 - BALANCE.damageVariance }));
    expect(midDamage).toBe(expectedDamage(55, 70, 1.0, { variance: 1 }));
    expect(highDamage).toBe(expectedDamage(55, 70, 1.0, { variance: 1 + BALANCE.damageVariance }));
    expect(lowDamage).toBeLessThan(midDamage);
    expect(midDamage).toBeLessThan(highDamage);
  });

  it('applies the affinity chart: strong beats neutral beats weak', () => {
    const fire = makeFamiliar({ familiarData: getFamiliar('yellowFighter')! }); // Fire
    const earth = makeFamiliar({ familiarData: getFamiliar('leafBunny')! }); // strong vs Fire attacker
    const water = makeFamiliar({ familiarData: getFamiliar('aquaSprite')! }); // weak vs Fire attacker
    const neutral = makeFamiliar({ familiarData: getFamiliar('whiteDog')! }); // Light

    // Same attacker stats, different defender affinity (defenses differ, so
    // compare multipliers rather than raw numbers).
    const strong = calculateDamage(fire, earth, 1.0, ScalingStat.Attack, steadyRng());
    const weak = calculateDamage(fire, water, 1.0, ScalingStat.Attack, steadyRng());
    const plain = calculateDamage(fire, neutral, 1.0, ScalingStat.Attack, steadyRng());
    expect(strong.effectiveness).toBe('strong');
    expect(weak.effectiveness).toBe('weak');
    expect(plain.effectiveness).toBe('neutral');

    const atk = fire.familiarData.stats.attack;
    expect(strong.damage).toBe(
      expectedDamage(atk, earth.familiarData.stats.defense, 1.0, { affinity: BALANCE.affinityStrong })
    );
    expect(weak.damage).toBe(
      expectedDamage(atk, water.familiarData.stats.defense, 1.0, { affinity: BALANCE.affinityWeak })
    );
    expect(strong.damage / plain.damage).toBeGreaterThan(1);
    expect(weak.damage / plain.damage).toBeLessThan(1);
  });

  it('halves damage when the defender is guarding', () => {
    const attacker = makeFamiliar();
    const defender = makeFamiliar();
    const open = calculateDamage(attacker, defender, 1.0, ScalingStat.Attack, steadyRng());
    const guarded = calculateDamage(attacker, defender, 1.0, ScalingStat.Attack, steadyRng(), {
      defenderGuarding: true,
    });
    expect(guarded.damage).toBe(expectedDamage(55, 70, 1.0, { guard: BALANCE.guardDamageTaken }));
    expect(guarded.damage).toBeLessThan(open.damage);
    expect(guarded.damage).toBeGreaterThanOrEqual(Math.floor(open.damage * 0.45));
  });

  it('doubles damage for a charged attacker', () => {
    const attacker = makeFamiliar({ charged: true });
    const defender = makeFamiliar();
    const hit = calculateDamage(attacker, defender, 1.0, ScalingStat.Attack, steadyRng());
    expect(hit.damage).toBe(expectedDamage(55, 70, 1.0, { charged: BALANCE.bossChargeMultiplier }));
    const plain = calculateDamage(makeFamiliar(), defender, 1.0, ScalingStat.Attack, steadyRng());
    expect(hit.damage / plain.damage).toBeGreaterThan(1.8);
  });
});

describe('applyStatusEffects', () => {
  it('returns the familiar unchanged when there are no effects', () => {
    const familiar = makeFamiliar();
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(120);
    expect(result.statusEffects).toHaveLength(0);
  });

  it('adds HP from HoT effects but clamps to maxHp', () => {
    const familiar = makeFamiliar({
      currentHp: 115,
      statusEffects: [
        { abilityId: 'naturabless', type: EffectType.Hot, stat: StatName.Hp, value: 10, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(120);
  });

  it('subtracts HP from DoT effects but clamps to 0', () => {
    const familiar = makeFamiliar({
      currentHp: 3,
      statusEffects: [{ abilityId: 'burn', type: EffectType.Dot, stat: StatName.Hp, value: 10, turnsRemaining: 2 }],
    });
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(0);
  });

  it('decrements turnsRemaining on all effects by 1', () => {
    const familiar = makeFamiliar({
      statusEffects: [
        { abilityId: 'sturdy', type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.statusEffects[0].turnsRemaining).toBe(1);
  });

  it('removes effects whose turnsRemaining reaches 0', () => {
    const familiar = makeFamiliar({
      statusEffects: [
        { abilityId: 'sturdy', type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 1 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.statusEffects).toHaveLength(0);
  });

  it('skipped effects neither proc nor decrement (effects applied this turn)', () => {
    const dot: StatusEffect = {
      abilityId: 'burn',
      type: EffectType.Dot,
      stat: StatName.Hp,
      value: 10,
      turnsRemaining: 3,
    };
    const hot: StatusEffect = {
      abilityId: 'regen',
      type: EffectType.Hot,
      stat: StatName.Hp,
      value: 5,
      turnsRemaining: 3,
    };
    const familiar = makeFamiliar({ currentHp: 50, statusEffects: [dot, hot] });
    const result = applyStatusEffects(familiar, new Set([dot]));
    // Skipped DoT deals no damage and keeps its duration; the unskipped HoT
    // still procs, so HP moves by +5 only.
    expect(result.statusEffects.find((e) => e.abilityId === 'burn')!.turnsRemaining).toBe(3);
    // Unskipped HoT procs (+5) and decrements as usual.
    expect(result.statusEffects.find((e) => e.abilityId === 'regen')!.turnsRemaining).toBe(2);
    expect(result.currentHp).toBe(55);
  });

  it('unskipped DoTs still proc and decrement when a skip set is provided', () => {
    const dot: StatusEffect = {
      abilityId: 'burn',
      type: EffectType.Dot,
      stat: StatName.Hp,
      value: 10,
      turnsRemaining: 2,
    };
    const familiar = makeFamiliar({ currentHp: 50, statusEffects: [dot] });
    const result = applyStatusEffects(familiar, new Set());
    expect(result.currentHp).toBe(40);
    expect(result.statusEffects.find((e) => e.abilityId === 'burn')!.turnsRemaining).toBe(1);
  });
});

describe('checkBattleOutcome', () => {
  it('returns win when enemy HP is 0 or below', () => {
    expect(checkBattleOutcome(makeFamiliar(), makeFamiliar({ currentHp: 0 }))).toBe(Outcome.Win);
  });

  it('returns lose when player HP is 0 or below', () => {
    expect(checkBattleOutcome(makeFamiliar({ currentHp: 0 }), makeFamiliar())).toBe(Outcome.Loss);
  });

  it('returns continue when both familiars have HP above 0', () => {
    expect(checkBattleOutcome(makeFamiliar({ currentHp: 50 }), makeFamiliar({ currentHp: 30 }))).toBe(Outcome.Continue);
  });
});

describe('resolveTurn', () => {
  it('returns damage effectType when the player attacks', () => {
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    expect(result.playerResult.value).toBe(expectedDamage(55, 70, 1.0));
    expect(result.playerResult.isCritical).toBe(false);
  });

  it('returns damage effectType when the enemy attacks', () => {
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(result.enemyResult.effectType).toBe(EffectType.Damage);
    expect(result.enemyResult.value).toBe(expectedDamage(55, 70, 1.0));
  });

  it('guards for the whole turn and restores MP instead of buffing defense', () => {
    const player = makeFamiliar({ currentMp: 40 });
    const enemy = makeFamiliar();
    const result = resolveTurn({ type: ActionType.Defend }, player, enemy, { type: ActionType.Attack }, steadyRng());

    // Transient stance: no status effect is created or persisted.
    expect(result.updatedPlayerFamiliar.statusEffects).toHaveLength(0);

    const maxMp = player.familiarData.stats.maxMp;
    const restored = Math.round(maxMp * BALANCE.guardMpRestore);
    expect(result.playerResult.effectType).toBe(EffectType.MpHeal);
    expect(result.playerResult.targetId).toBe(player.uid);
    expect(result.playerResult.value).toBe(restored);
    expect(result.playerResult.description).toBe(`White Dog guards and recovers ${restored} MP`);
    expect(result.updatedPlayerFamiliar.currentMp).toBe(40 + restored);

    // Incoming direct damage is halved and marked guarded.
    expect(result.enemyResult.value).toBe(expectedDamage(55, 70, 1.0, { guard: BALANCE.guardDamageTaken }));
    expect(result.enemyResult.guarded).toBe(true);
    expect(result.enemyResult.description).toContain('(guarded)');
    expect(result.updatedPlayerFamiliar.currentHp).toBe(120 - result.enemyResult.value);
  });

  it('guards even when the attacker acts first (speed order does not matter)', () => {
    // sparkMouse (speed 90) outruns whiteDog (60) and strikes before the
    // player's Defend slot resolves.
    const player = makeFamiliar();
    const enemy = makeFamiliar({ familiarData: getFamiliar('sparkMouse')!, currentHp: 75 });
    const result = resolveTurn({ type: ActionType.Defend }, player, enemy, { type: ActionType.Attack }, steadyRng());
    expect(result.steps.map((s) => s.actorUid)).toEqual([enemy.uid, player.uid]);
    expect(result.enemyResult.value).toBe(expectedDamage(60, 70, 1.0, { guard: BALANCE.guardDamageTaken }));
    expect(result.enemyResult.guarded).toBe(true);
    expect(result.updatedPlayerFamiliar.currentHp).toBe(120 - result.enemyResult.value);
  });

  it('guard is transient: the next turn takes full damage again', () => {
    const player = makeFamiliar();
    const enemy = makeFamiliar();
    const guardedTurn = resolveTurn(
      { type: ActionType.Defend },
      player,
      enemy,
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(guardedTurn.updatedPlayerFamiliar.statusEffects).toHaveLength(0);

    const nextTurn = resolveTurn(
      { type: ActionType.Attack },
      guardedTurn.updatedPlayerFamiliar,
      enemy,
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(nextTurn.enemyResult.value).toBe(expectedDamage(55, 70, 1.0));
    expect(nextTurn.enemyResult.guarded).toBeUndefined();
  });

  it('restores MP capped by the missing amount', () => {
    const player = makeFamiliar({ currentMp: 75 }); // max 80
    const result = resolveTurn(
      { type: ActionType.Defend },
      player,
      makeFamiliar(),
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(result.playerResult.value).toBe(5);
    expect(result.updatedPlayerFamiliar.currentMp).toBe(80);
  });

  it("does not guard-restore when the guarding actor's slot is cancelled by a KO", () => {
    const player = makeFamiliar({ currentHp: 1, currentMp: 40 });
    const enemy = makeFamiliar({ familiarData: getFamiliar('sparkMouse')!, currentHp: 75 });
    const result = resolveTurn({ type: ActionType.Defend }, player, enemy, { type: ActionType.Attack }, steadyRng());
    expect(result.canceledActions).toHaveLength(1);
    expect(result.playerResult.description).toContain('was knocked out before it could act');
    expect(result.updatedPlayerFamiliar.currentMp).toBe(40);
    expect(result.updatedPlayerFamiliar.currentHp).toBe(0);
  });

  it('does not reduce end-of-turn DoT ticks while guarding', () => {
    const burn: StatusEffect = {
      abilityId: 'burn',
      type: EffectType.Dot,
      stat: StatName.Hp,
      value: 10,
      turnsRemaining: 2,
    };
    const player = makeFamiliar({ currentHp: 100, statusEffects: [burn] });
    const result = resolveTurn(
      { type: ActionType.Defend },
      player,
      makeFamiliar(),
      { type: ActionType.Attack },
      steadyRng()
    );
    const direct = expectedDamage(55, 70, 1.0, { guard: BALANCE.guardDamageTaken });
    expect(result.updatedPlayerFamiliar.currentHp).toBe(100 - direct - 10);
  });

  it('deals damage when the player uses the brave ability', () => {
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'brave' },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    // brave: 1.5x attack
    expect(result.playerResult.value).toBe(expectedDamage(55, 70, 1.5));
  });

  it('appends affinity text to the attack description', () => {
    const fire = makeFamiliar({ familiarData: getFamiliar('yellowFighter')! });
    const earth = makeFamiliar({ familiarData: getFamiliar('leafBunny')!, currentHp: 110 });
    const result = resolveTurn({ type: ActionType.Attack }, fire, earth, { type: ActionType.Defend }, steadyRng());
    expect(result.playerResult.effectiveness).toBe('strong');
    expect(result.playerResult.description).toContain("It's super effective!");
  });

  it('heals when the player uses the healpulse ability', () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'healpulse' },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      rng
    );
    expect(result.playerResult.effectType).toBe(EffectType.Heal);
    // Math.round(120 * 0.3) = 36
    expect(result.playerResult.value).toBe(36);
  });

  it('applies shadowstrike debuff to the enemy via updatedEnemyFamiliar', () => {
    const rng = makeRng(42);
    const player = makeFamiliar();
    const enemy = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'shadowstrike' },
      player,
      enemy,
      { type: ActionType.Attack },
      rng
    );
    expect(result.playerResult.appliedEffects).toHaveLength(1);
    expect(result.playerResult.appliedEffects![0]).toMatchObject({
      abilityId: 'shadowstrike',
      type: EffectType.Debuff,
      stat: StatName.Defense,
      value: 0.8,
    });
    // Debuff applied by the player this turn is not ticked: it keeps its full
    // 2-turn duration and first procs/ticks at the end of the NEXT turn.
    expect(result.updatedEnemyFamiliar.statusEffects).toHaveLength(1);
    expect(result.updatedEnemyFamiliar.statusEffects[0].stat).toBe(StatName.Defense);
    expect(result.updatedEnemyFamiliar.statusEffects[0].turnsRemaining).toBe(2);
  });

  it('applies sturdy buff to self via updatedPlayerFamiliar', () => {
    const rng = makeRng(42);
    const player = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'sturdy' },
      player,
      makeFamiliar(),
      { type: ActionType.Attack },
      rng
    );
    expect(result.playerResult.appliedEffects).toHaveLength(1);
    expect(result.playerResult.appliedEffects![0]).toMatchObject({
      abilityId: 'sturdy',
      type: EffectType.Buff,
      stat: StatName.Defense,
      value: 1.5,
    });
    // Buff applied this turn is not ticked: full 2-turn duration retained.
    expect(result.updatedPlayerFamiliar.statusEffects).toHaveLength(1);
    expect(result.updatedPlayerFamiliar.statusEffects[0].turnsRemaining).toBe(2);
  });

  it('applies naturabless HoT to self and heals', () => {
    const player = makeFamiliar({ currentHp: 100 });
    const enemy = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'naturabless' },
      player,
      enemy,
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(result.playerResult.effectType).toBe(EffectType.Heal);
    // Math.round(120 * 0.2) = 24
    expect(result.playerResult.value).toBe(24);
    expect(result.playerResult.appliedEffects).toHaveLength(1);
    expect(result.playerResult.appliedEffects![0]).toMatchObject({
      abilityId: 'naturabless',
      type: EffectType.Hot,
      value: 5,
    });
    // Fresh HoT neither procs nor ticks on the application turn: it stays at
    // its full 2-turn duration and heals for the first time NEXT turn.
    expect(result.updatedPlayerFamiliar.statusEffects).toHaveLength(1);
    expect(result.updatedPlayerFamiliar.statusEffects[0].type).toBe(EffectType.Hot);
    expect(result.updatedPlayerFamiliar.statusEffects[0].turnsRemaining).toBe(2);
    // HP: 100 + 24 (heal, CAPPED at maxHp 120) - 32 (enemy attack) = 88 (no HoT proc)
    expect(result.updatedPlayerFamiliar.currentHp).toBe(120 - expectedDamage(55, 70, 1.0));
  });

  it('returns error when MP is insufficient for the ability', () => {
    const rng = makeRng(42);
    const player = makeFamiliar({ currentMp: 5 });
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'fireball' },
      player,
      makeFamiliar(),
      { type: ActionType.Attack },
      rng
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    expect(result.playerResult.value).toBe(0);
    expect(result.playerResult.description).toContain('does not have enough MP');
  });

  it('returns updated familiar with reduced HP after taking damage', () => {
    const player = makeFamiliar();
    const enemy = makeFamiliar({
      familiarData: getFamiliar('yellowFighter')!,
      currentHp: 140,
    });
    const result = resolveTurn({ type: ActionType.Attack }, player, enemy, { type: ActionType.Attack }, steadyRng());
    const playerHit = expectedDamage(55, 45, 1.0);
    const enemyHit = expectedDamage(80, 70, 1.0);
    expect(result.playerResult.value).toBe(playerHit);
    expect(result.enemyResult.value).toBe(enemyHit);
    // yellowFighter is faster (75 > 60): it acts first, so the player's
    // retaliation is what lands second.
    expect(result.steps.map((s) => s.actorUid)).toEqual([enemy.uid, player.uid]);
    expect(result.updatedPlayerFamiliar.currentHp).toBe(120 - enemyHit);
    expect(result.updatedEnemyFamiliar.currentHp).toBe(140 - playerHit);
  });

  it('does not double-apply damage when player and enemy share the same species', () => {
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar({ currentHp: 120 }),
      makeFamiliar({ currentHp: 120 }),
      { type: ActionType.Attack },
      steadyRng()
    );
    const hit = expectedDamage(55, 70, 1.0);
    // Without the uid fix the player's own attack would also land on the
    // player, dropping them to 120 - 2 * hit.
    expect(result.updatedPlayerFamiliar.currentHp).toBe(120 - hit);
    expect(result.updatedEnemyFamiliar.currentHp).toBe(120 - hit);
  });

  it("cancels the slower enemy's action when the faster player KOs it first (Win)", () => {
    const rng = makeRng(42);
    const dogData = getFamiliar('whiteDog')!;
    const enemy = makeFamiliar({
      currentHp: 20,
      currentMp: 90,
      familiarData: { ...dogData, stats: { ...dogData.stats, speed: 50 } },
    });
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      enemy,
      { type: ActionType.Ability, abilityId: 'brave' },
      rng
    );
    // Player is faster (60 > 50): its 20-damage attack drops the enemy to 0
    // before the enemy's slot, so the enemy's brave is never executed.
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].actorUid).toBe(result.updatedPlayerFamiliar.uid);
    expect(result.canceledActions).toHaveLength(1);
    expect(result.canceledActions[0].uid).toBe(enemy.uid);
    expect(result.canceledActions[0].reason).toBe(`${enemy.familiarData.name} was knocked out before it could act!`);
    // The canceled slot carries the placeholder result.
    expect(result.enemyResult.effectType).toBe(EffectType.Damage);
    expect(result.enemyResult.targetId).toBe(enemy.uid);
    expect(result.enemyResult.value).toBe(0);
    expect(result.enemyResult.isCritical).toBe(false);
    expect(result.enemyResult.description).toContain('was knocked out before it could act');
    // Cancellation costs nothing: no damage taken, no MP spent, no effects applied.
    expect(result.updatedPlayerFamiliar.currentHp).toBe(120);
    expect(result.updatedEnemyFamiliar.currentMp).toBe(90);
    expect(result.updatedEnemyFamiliar.statusEffects).toHaveLength(0);
    expect(checkBattleOutcome(result.updatedPlayerFamiliar, result.updatedEnemyFamiliar)).toBe(Outcome.Win);
  });

  it('awards the player 1 HP on a mutual KO caused by end-of-turn ticking', () => {
    const burn = (id: string): StatusEffect => ({
      abilityId: id,
      type: EffectType.Dot,
      stat: StatName.Hp,
      value: 40,
      turnsRemaining: 2,
    });
    const player = makeFamiliar({ currentHp: 60, statusEffects: [burn('burn-a')] });
    const enemy = makeFamiliar({ currentHp: 60, statusEffects: [burn('burn-b')] });
    const result = resolveTurn({ type: ActionType.Attack }, player, enemy, { type: ActionType.Attack }, steadyRng());
    // Both attacks land (32 each): 60 → 28 on both sides, so nobody is KO'd
    // mid-turn and neither action is canceled.
    expect(result.canceledActions).toHaveLength(0);
    expect(result.steps).toHaveLength(2);
    // Pre-existing DoTs proc at end of turn: 28 - 40 → both at 0. The mutual-KO
    // survival rule leaves the player at 1 HP for the Win.
    expect(result.updatedPlayerFamiliar.currentHp).toBe(1);
    expect(result.updatedEnemyFamiliar.currentHp).toBe(0);
    expect(checkBattleOutcome(result.updatedPlayerFamiliar, result.updatedEnemyFamiliar)).toBe(Outcome.Win);
  });

  it("cancels the slower player's action when the faster enemy KOs them first (Loss)", () => {
    const player = makeFamiliar({ currentHp: 45 });
    const enemy = makeFamiliar({
      familiarData: getFamiliar('yellowFighter')!,
      currentHp: 140,
    });
    const result = resolveTurn({ type: ActionType.Attack }, player, enemy, { type: ActionType.Attack }, steadyRng());
    // yellowFighter is faster (75 > 60) and strikes first for 47 (80 * 100/170),
    // which is above the player's remaining 45 HP. The player's attack is
    // canceled before executing.
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].actorUid).toBe(enemy.uid);
    expect(result.enemyResult.value).toBe(expectedDamage(80, 70, 1.0));
    expect(result.canceledActions).toHaveLength(1);
    expect(result.canceledActions[0].uid).toBe(player.uid);
    // Placeholder fills the player's slot; the enemy takes no damage.
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    expect(result.playerResult.targetId).toBe(player.uid);
    expect(result.playerResult.value).toBe(0);
    expect(result.playerResult.description).toContain('was knocked out before it could act');
    expect(result.updatedPlayerFamiliar.currentHp).toBe(0);
    expect(result.updatedEnemyFamiliar.currentHp).toBe(140);
    expect(checkBattleOutcome(result.updatedPlayerFamiliar, result.updatedEnemyFamiliar)).toBe(Outcome.Loss);
  });

  it('returns 0 damage and Unknown ability description for a nonexistent abilityId', () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'nonexistent' },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      rng
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    expect(result.playerResult.value).toBe(0);
    expect(result.playerResult.isCritical).toBe(false);
    expect(result.playerResult.description).toBe('Unknown ability used');
  });

  it("lets a faster enemy act first so its damage lands before the player's action takes effect", () => {
    const player = makeFamiliar(); // whiteDog, speed 60
    const enemy = makeFamiliar({
      familiarData: getFamiliar('sparkMouse')!, // speed 90
      currentHp: 75,
    });
    const result = resolveTurn({ type: ActionType.Attack }, player, enemy, { type: ActionType.Attack }, steadyRng());
    const enemyHit = expectedDamage(60, 70, 1.0);
    const playerHit = expectedDamage(55, 35, 1.0);
    expect(result.steps.map((s) => s.actorUid)).toEqual([enemy.uid, player.uid]);
    // Step 0 (sparkMouse attack): the player is already hurt while the enemy is
    // untouched.
    expect(result.steps[0].playerAfter.currentHp).toBe(120 - enemyHit);
    expect(result.steps[0].enemyAfter.currentHp).toBe(75);
    // Step 1 (whiteDog retaliation): the enemy damage only lands after the
    // enemy has already struck.
    expect(result.steps[1].enemyAfter.currentHp).toBe(75 - playerHit);
    expect(result.steps[1].playerAfter.currentHp).toBe(120 - enemyHit);
  });

  it("breaks speed ties in the player's favor without an RNG roll", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(), // speed 60
      makeFamiliar(), // speed 60 → tie
      { type: ActionType.Defend },
      rng
    );
    expect(result.steps.map((s) => s.actorUid)).toEqual([
      result.updatedPlayerFamiliar.uid,
      result.updatedEnemyFamiliar.uid,
    ]);
    expect(result.canceledActions).toHaveLength(0);
  });

  it('does not reorder the current turn when a speed buff is applied mid-turn', () => {
    const rng = makeRng(42);
    const player = makeFamiliar(); // whiteDog, speed 60
    const enemy = makeFamiliar({
      familiarData: getFamiliar('yellowFighter')!, // speed 75
      currentHp: 140,
    });
    // Quickstep would raise the player to 90 effective speed, but initiative
    // was locked in before execution — the enemy still acts first THIS turn.
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'quickstep' },
      player,
      enemy,
      { type: ActionType.Attack },
      rng
    );
    expect(result.steps.map((s) => s.actorUid)).toEqual([enemy.uid, player.uid]);
    expect(result.canceledActions).toHaveLength(0);
  });

  it('does not tick effects the ENEMY applied this turn (symmetric freshness)', () => {
    const player = makeFamiliar();
    const enemy = makeFamiliar({
      familiarData: getFamiliar('aquaSprite')!, // speed 55 < 60 → acts second
      currentHp: 90,
    });
    const result = resolveTurn(
      { type: ActionType.Attack },
      player,
      enemy,
      { type: ActionType.Ability, abilityId: 'naturabless' },
      steadyRng()
    );
    expect(result.steps.map((s) => s.actorUid)).toEqual([player.uid, enemy.uid]);
    // aquaSprite heals Math.round(90 * 0.2) = 18 and gains a 5 HP HoT for 2 turns.
    expect(result.enemyResult.appliedEffects).toHaveLength(1);
    expect(result.enemyResult.value).toBe(18);
    const hot = result.updatedEnemyFamiliar.statusEffects.find((e) => e.abilityId === 'naturabless')!;
    expect(hot.turnsRemaining).toBe(2);
    // The fresh HoT does not proc on the application turn:
    // 90 - 37 (whiteDog attack vs defense 50) + 18 (heal, capped at maxHp 90) = 71.
    expect(result.updatedEnemyFamiliar.currentHp).toBe(90 - expectedDamage(55, 50, 1.0) + 18);
  });

  it('still procs and decrements pre-existing effects when fresh ones are applied the same turn', () => {
    const oldBurn: StatusEffect = {
      abilityId: 'burn',
      type: EffectType.Dot,
      stat: StatName.Hp,
      value: 10,
      turnsRemaining: 2,
    };
    const oldSturdy: StatusEffect = {
      abilityId: 'sturdy',
      type: EffectType.Buff,
      stat: StatName.Defense,
      value: 1.5,
      turnsRemaining: 3,
    };
    const player = makeFamiliar({ currentHp: 100, statusEffects: [oldBurn, oldSturdy] });
    const enemy = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'naturabless' },
      player,
      enemy,
      { type: ActionType.Attack },
      steadyRng()
    );
    const effects = result.updatedPlayerFamiliar.statusEffects;
    // Fresh HoT: no proc, no decrement.
    expect(effects.find((e) => e.abilityId === 'naturabless')!.turnsRemaining).toBe(2);
    // Pre-existing effects proc/decrement as normal.
    expect(effects.find((e) => e.abilityId === 'burn')!.turnsRemaining).toBe(1);
    expect(effects.find((e) => e.abilityId === 'sturdy')!.turnsRemaining).toBe(2);
    // HP: 120 (heal capped at maxHp) - 27 (enemy attack vs the OLD sturdy buff:
    // defense 105) - 10 (old burn proc) = 83
    expect(result.updatedPlayerFamiliar.currentHp).toBe(120 - expectedDamage(55, 105, 1.0) - 10);
  });

  it('deducts MP immediately for whichever actor uses an ability', () => {
    const rng = makeRng(42);
    const player = makeFamiliar({ currentMp: 80 });
    const enemy = makeFamiliar({
      familiarData: getFamiliar('sparkMouse')!, // speed 90 → acts first
      currentHp: 75,
      currentMp: 60,
    });
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: 'brave' },
      player,
      enemy,
      { type: ActionType.Ability, abilityId: 'brave' },
      rng
    );
    expect(result.steps.map((s) => s.actorUid)).toEqual([enemy.uid, player.uid]);
    expect(result.updatedEnemyFamiliar.currentMp).toBe(60 - 10);
    expect(result.updatedPlayerFamiliar.currentMp).toBe(80 - 10);
    // Playback snapshots carry per-step MP state too.
    expect(result.steps[0].playerAfter.currentMp).toBe(80);
    expect(result.steps[1].playerAfter.currentMp).toBe(70);
  });

  it('Charge sets the charged flag, costs no MP and creates no status effect', () => {
    const enemy = makeFamiliar({ currentMp: 55 });
    const result = resolveTurn(
      { type: ActionType.Defend },
      makeFamiliar(),
      enemy,
      { type: ActionType.Charge },
      steadyRng()
    );
    expect(result.enemyResult.effectType).toBe(EffectType.Buff);
    expect(result.enemyResult.targetId).toBe(enemy.uid);
    expect(result.enemyResult.value).toBe(0);
    expect(result.enemyResult.description).toBe(`${enemy.familiarData.name} is gathering power!`);
    expect(result.enemyResult.appliedEffects).toBeUndefined();
    expect(result.updatedEnemyFamiliar.charged).toBe(true);
    expect(result.updatedEnemyFamiliar.currentMp).toBe(55);
    expect(result.updatedEnemyFamiliar.statusEffects).toHaveLength(0);
  });

  it('a charged attacker unleashes double damage and clears the charge', () => {
    const enemy = makeFamiliar({ charged: true });
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      enemy,
      { type: ActionType.Attack },
      steadyRng()
    );
    expect(result.enemyResult.value).toBe(expectedDamage(55, 70, 1.0, { charged: BALANCE.bossChargeMultiplier }));
    expect(result.updatedEnemyFamiliar.charged).toBe(false);
  });

  it('a charged attacker keeps the charge through a non-damaging action', () => {
    const enemy = makeFamiliar({ charged: true });
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      enemy,
      { type: ActionType.Ability, abilityId: 'sturdy' },
      steadyRng()
    );
    expect(result.enemyResult.effectType).toBe(EffectType.Buff);
    expect(result.updatedEnemyFamiliar.charged).toBe(true);
    // No damage multiplier was applied to the player this turn.
    expect(result.playerResult.value).toBe(expectedDamage(55, 70, 1.0));
  });

  it('a charged damaging ability also spends the charge', () => {
    const enemy = makeFamiliar({ familiarData: getFamiliar('yellowFighter')!, currentHp: 140, charged: true });
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      enemy,
      { type: ActionType.Ability, abilityId: 'brave' },
      steadyRng()
    );
    // brave 1.5x attack (80) vs defense 70, doubled by the charge.
    expect(result.enemyResult.value).toBe(expectedDamage(80, 70, 1.5, { charged: BALANCE.bossChargeMultiplier }));
    expect(result.updatedEnemyFamiliar.charged).toBe(false);
  });
});

describe('updateCooldowns', () => {
  it('decrements an active cooldown by 1 when called with no second argument', () => {
    const familiar = makeFamiliar({ cooldowns: { fireball: 2 } });
    const result = updateCooldowns(familiar);
    expect(result.cooldowns).toEqual({ fireball: 1 });
  });

  it("sets the used ability's cooldown to its data value and does not mutate the input", () => {
    // fireball has cooldown: 2 in data/abilities.ts
    const familiar = makeFamiliar({ cooldowns: {} });
    const result = updateCooldowns(familiar, 'fireball');
    expect(result.cooldowns).toEqual({ fireball: 2 });
    expect(familiar.cooldowns).toEqual({});
    expect(result).not.toBe(familiar);
  });

  it('preserves other familiar fields on the returned copy', () => {
    const familiar = makeFamiliar({ currentHp: 55, currentMp: 12, cooldowns: {} });
    const result = updateCooldowns(familiar, 'sturdy');
    expect(result.uid).toBe(familiar.uid);
    expect(result.currentHp).toBe(55);
    expect(result.currentMp).toBe(12);
    expect(result.statusEffects).toEqual([]);
  });

  it('usedAbilityId undefined sets no cooldown (KO-cancel / non-ability contract)', () => {
    const familiar = makeFamiliar({ cooldowns: { fireball: 2 } });
    const result = updateCooldowns(familiar, undefined);
    expect(result.cooldowns).toEqual({ fireball: 1 });
  });

  it('usedAbilityId null behaves the same as undefined', () => {
    const familiar = makeFamiliar({ cooldowns: { fireball: 3 } });
    const result = updateCooldowns(familiar, null);
    expect(result.cooldowns).toEqual({ fireball: 2 });
  });

  it('unknown ability id adds no key but still decrements existing cooldowns', () => {
    const familiar = makeFamiliar({ cooldowns: { sturdy: 2 } });
    const result = updateCooldowns(familiar, 'not-a-real-ability');
    expect(result.cooldowns).toEqual({ sturdy: 1 });
    expect('not-a-real-ability' in result.cooldowns).toBe(false);
  });

  it('cooldown reaching zero stays as a key with value 0 (clamped, not removed)', () => {
    // Codifies CURRENT behavior: Math.max(0, x - 1) clamps at 0 and the key
    // persists in the record rather than being deleted.
    const familiar = makeFamiliar({ cooldowns: { healpulse: 1 } });
    const result = updateCooldowns(familiar);
    expect(result.cooldowns).toEqual({ healpulse: 0 });
    expect(Object.keys(result.cooldowns)).toEqual(['healpulse']);
  });

  it('already-zero cooldown stays at zero', () => {
    const familiar = makeFamiliar({ cooldowns: { fireball: 0 } });
    const result = updateCooldowns(familiar);
    expect(result.cooldowns).toEqual({ fireball: 0 });
  });

  it('decrementing a just-used ability starts its fresh countdown next turn', () => {
    // Round N: use fireball → set to its cooldown value. Round N+1: tick
    // decrements it while another ability is used.
    const roundN = updateCooldowns(makeFamiliar(), 'fireball');
    expect(roundN.cooldowns).toEqual({ fireball: 2 });
    const roundNext = updateCooldowns(roundN, 'sturdy'); // sturdy cooldown: 3
    expect(roundNext.cooldowns).toEqual({ fireball: 1, sturdy: 3 });
  });
});
