import { describe, it, expect, beforeEach } from "vitest";
import { getEffectiveStat, calculateDamage, applyStatusEffects, checkBattleOutcome, resolveTurn } from "../battleEngine";
import { seededRandom } from "../mathUtils";
import { getFamiliar } from "../../data/familiars";
import { ActionType, Outcome } from "../../types/battle";
import { EffectType, ScalingStat, StatName } from "../../data/abilities";
import type { BattleFamiliar, StatusEffect, BattleAction } from "../../types/battle";

function makeRng(seed = 42): () => number {
  return seededRandom(seed);
}

function makeFamiliar(overrides: Partial<BattleFamiliar> = {}): BattleFamiliar {
  return {
    familiarData: getFamiliar("whiteDog")!,
    currentHp: 120,
    currentMp: 80,
    statusEffects: [],
    cooldowns: {},
    isAlly: true,
    ...overrides,
  };
}

describe("getEffectiveStat", () => {
  it("returns base stat unchanged when no effects are active", () => {
    expect(getEffectiveStat(100, [], StatName.Attack)).toBe(100);
  });

  it("applies a single 1.5x buff", () => {
    const effects: StatusEffect[] = [
      { abilityId: "sturdy", type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Defense)).toBe(150);
  });

  it("multiplies multiple buffs together", () => {
    const effects: StatusEffect[] = [
      { abilityId: "a", type: EffectType.Buff, stat: StatName.Attack, value: 1.5, turnsRemaining: 2 },
      { abilityId: "b", type: EffectType.Buff, stat: StatName.Attack, value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Attack)).toBe(225);
  });

  it("reduces stat for a debuff below 1", () => {
    const effects: StatusEffect[] = [
      { abilityId: "shadowstrike", type: EffectType.Debuff, stat: StatName.Defense, value: 0.8, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Defense)).toBe(80);
  });

  it("returns minimum 1 even with a severe debuff on a low stat", () => {
    const effects: StatusEffect[] = [
      { abilityId: "x", type: EffectType.Debuff, stat: StatName.Attack, value: 0.1, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(1, effects, StatName.Attack)).toBe(1);
  });

  it("only considers effects whose stat name matches", () => {
    const effects: StatusEffect[] = [
      { abilityId: "sturdy", type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Attack)).toBe(100);
  });

  it("ignores dot and hot effects since they are not buff/debuff", () => {
    const effects: StatusEffect[] = [
      { abilityId: "naturabless", type: EffectType.Hot, stat: StatName.Attack, value: 5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, StatName.Attack)).toBe(100);
  });
});

describe("calculateDamage", () => {
  it("computes basic attack damage with multiplier 1.0", () => {
    const rng = makeRng(42);
    const attacker = makeFamiliar();
    const defender = makeFamiliar();
    const result = calculateDamage(attacker, defender, 1.0, ScalingStat.Attack, rng);
    // 55 * 1.0 - 70 / 2 = 20
    expect(result.damage).toBe(20);
    expect(result.isCritical).toBe(false);
  });

  it("uses arcane stat for arcane-scaled abilities", () => {
    const rng = makeRng(42);
    const attacker = makeFamiliar(); // arcane = 45
    const defender = makeFamiliar(); // defense = 70
    const result = calculateDamage(attacker, defender, 2.0, ScalingStat.Arcane, rng);
    // 45 * 2.0 - 70 / 2 = 90 - 35 = 55
    expect(result.damage).toBe(55);
  });

  it("returns minimum 1 damage when defense is absurdly high", () => {
    const defender = makeFamiliar({
      familiarData: {
        ...getFamiliar("whiteDog")!,
        stats: { ...getFamiliar("whiteDog")!.stats, defense: 500 },
      },
    });
    const result = calculateDamage(makeFamiliar(), defender, 1.0, ScalingStat.Attack, () => 0.5);
    expect(result.damage).toBe(1);
  });

  it("applies 1.5x critical multiplier when rng produces a value below 0.1", () => {
    const rng = makeRng(7);
    const attacker = makeFamiliar();
    const defender = makeFamiliar();
    const result = calculateDamage(attacker, defender, 1.0, ScalingStat.Attack, rng);
    // 55 * 1.0 - 35 = 20; 20 * 1.5 = 30
    expect(result.damage).toBe(30);
    expect(result.isCritical).toBe(true);
  });

  it("does not crit when rng value is 0.1 or above", () => {
    const rng = makeRng(42);
    const result = calculateDamage(makeFamiliar(), makeFamiliar(), 1.0, ScalingStat.Attack, rng);
    expect(result.isCritical).toBe(false);
  });
});

describe("applyStatusEffects", () => {
  it("returns the familiar unchanged when there are no effects", () => {
    const familiar = makeFamiliar();
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(120);
    expect(result.statusEffects).toHaveLength(0);
  });

  it("adds HP from HoT effects but clamps to maxHp", () => {
    const familiar = makeFamiliar({
      currentHp: 115,
      statusEffects: [
        { abilityId: "naturabless", type: EffectType.Hot, stat: StatName.Hp, value: 10, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(120);
  });

  it("subtracts HP from DoT effects but clamps to 0", () => {
    const familiar = makeFamiliar({
      currentHp: 3,
      statusEffects: [
        { abilityId: "burn", type: EffectType.Dot, stat: StatName.Hp, value: 10, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(0);
  });

  it("decrements turnsRemaining on all effects by 1", () => {
    const familiar = makeFamiliar({
      statusEffects: [
        { abilityId: "sturdy", type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.statusEffects[0].turnsRemaining).toBe(1);
  });

  it("removes effects whose turnsRemaining reaches 0", () => {
    const familiar = makeFamiliar({
      statusEffects: [
        { abilityId: "sturdy", type: EffectType.Buff, stat: StatName.Defense, value: 1.5, turnsRemaining: 1 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.statusEffects).toHaveLength(0);
  });
});

describe("checkBattleOutcome", () => {
  it("returns win when enemy HP is 0 or below", () => {
    expect(checkBattleOutcome(makeFamiliar(), makeFamiliar({ currentHp: 0 }))).toBe(Outcome.Win);
  });

  it("returns lose when player HP is 0 or below", () => {
    expect(checkBattleOutcome(makeFamiliar({ currentHp: 0 }), makeFamiliar())).toBe(Outcome.Loss);
  });

  it("returns continue when both familiars have HP above 0", () => {
    expect(checkBattleOutcome(makeFamiliar({ currentHp: 50 }), makeFamiliar({ currentHp: 30 }))).toBe(Outcome.Continue);
  });
});

describe("resolveTurn", () => {
  it("returns damage effectType when the player attacks", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    expect(result.playerResult.value).toBe(20);
    expect(result.playerResult.isCritical).toBe(false);
  });

  it("returns damage effectType when the enemy attacks", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Attack },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      rng,
    );
    expect(result.enemyResult.effectType).toBe(EffectType.Damage);
    expect(result.enemyResult.value).toBe(20);
  });

  it("applies defend buff and returns updated player familiar with defense buff", () => {
    const rng = makeRng(42);
    const player = makeFamiliar();
    const enemy = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Defend },
      player,
      enemy,
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.effectType).toBe(EffectType.Buff);
    expect(result.playerResult.value).toBe(1.5);
    expect(result.playerResult.description).toBe("White Dog defends");
    expect(result.playerResult.appliedEffects).toHaveLength(1);
    expect(result.playerResult.appliedEffects![0]).toEqual({
      abilityId: "defend",
      type: EffectType.Buff,
      stat: StatName.Defense,
      value: 1.5,
      turnsRemaining: 1,
    });
    // Defend buff expires after the turn (turnsRemaining: 1 → 0 → removed)
    expect(result.updatedPlayerFamiliar.statusEffects).toHaveLength(0);
    // Enemy attack damage is reduced due to defend buff (70 * 1.5 = 105 defense)
    // 55 * 1.0 - 105 / 2 = 2.5 → 3 (minimum 1)
    expect(result.enemyResult.value).toBe(3);
    // Player HP: 120 - 3 = 117
    expect(result.updatedPlayerFamiliar.currentHp).toBe(117);
  });

  it("deals damage when the player uses the brave ability", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: "brave" },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    // 55 * 1.5 - 70 / 2 = 82.5 - 35 = 47.5 -> Math.round -> 48
    expect(result.playerResult.value).toBe(48);
  });

  it("heals when the player uses the healpulse ability", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: "healpulse" },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.effectType).toBe(EffectType.Heal);
    // Math.round(120 * 0.3) = 36
    expect(result.playerResult.value).toBe(36);
  });

  it("applies shadowstrike debuff to the enemy via updatedEnemyFamiliar", () => {
    const rng = makeRng(42);
    const player = makeFamiliar();
    const enemy = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: "shadowstrike" },
      player,
      enemy,
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.appliedEffects).toHaveLength(1);
    expect(result.playerResult.appliedEffects![0]).toMatchObject({
      abilityId: "shadowstrike",
      type: EffectType.Debuff,
      stat: StatName.Defense,
      value: 0.8,
    });
    // Debuff is ticked (turnsRemaining: 2 → 1)
    expect(result.updatedEnemyFamiliar.statusEffects).toHaveLength(1);
    expect(result.updatedEnemyFamiliar.statusEffects[0].stat).toBe(StatName.Defense);
    expect(result.updatedEnemyFamiliar.statusEffects[0].turnsRemaining).toBe(1);
  });

  it("applies sturdy buff to self via updatedPlayerFamiliar", () => {
    const rng = makeRng(42);
    const player = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: "sturdy" },
      player,
      makeFamiliar(),
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.appliedEffects).toHaveLength(1);
    expect(result.playerResult.appliedEffects![0]).toMatchObject({
      abilityId: "sturdy",
      type: EffectType.Buff,
      stat: StatName.Defense,
      value: 1.5,
    });
    // Buff is ticked (turnsRemaining: 2 → 1)
    expect(result.updatedPlayerFamiliar.statusEffects).toHaveLength(1);
    expect(result.updatedPlayerFamiliar.statusEffects[0].turnsRemaining).toBe(1);
  });

  it("applies naturabless HoT to self and heals", () => {
    const rng = makeRng(42);
    const player = makeFamiliar({ currentHp: 100 });
    const enemy = makeFamiliar();
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: "naturabless" },
      player,
      enemy,
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.effectType).toBe(EffectType.Heal);
    // Math.round(120 * 0.2) = 24
    expect(result.playerResult.value).toBe(24);
    expect(result.playerResult.appliedEffects).toHaveLength(1);
    expect(result.playerResult.appliedEffects![0]).toMatchObject({
      abilityId: "naturabless",
      type: EffectType.Hot,
      value: 5,
    });
    // HoT is ticked (turnsRemaining: 2 → 1) and applies 5 HP healing
    expect(result.updatedPlayerFamiliar.statusEffects).toHaveLength(1);
    expect(result.updatedPlayerFamiliar.statusEffects[0].type).toBe(EffectType.Hot);
    expect(result.updatedPlayerFamiliar.statusEffects[0].turnsRemaining).toBe(1);
    // HP: 100 + 24 (heal, capped at 120) - 20 (enemy attack) + 5 (HoT) = 105
    expect(result.updatedPlayerFamiliar.currentHp).toBe(105);
  });

  it("returns error when MP is insufficient for the ability", () => {
    const rng = makeRng(42);
    const player = makeFamiliar({ currentMp: 5 });
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: "fireball" },
      player,
      makeFamiliar(),
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    expect(result.playerResult.value).toBe(0);
    expect(result.playerResult.description).toContain("does not have enough MP");
  });

  it("returns updated familiar with reduced HP after taking damage", () => {
    const rng = makeRng(42);
    const player = makeFamiliar();
    const enemy = makeFamiliar({
      familiarData: getFamiliar("yellowFighter")!,
      currentHp: 140,
    });
    const result = resolveTurn(
      { type: ActionType.Attack },
      player,
      enemy,
      { type: ActionType.Attack },
      rng,
    );
    // Player (attack: 55) attacks enemy (defense: 45): 55 * 1.0 - 45 / 2 = 32.5 → 33
    // Enemy (attack: 80) attacks player (defense: 70): 80 * 1.0 - 70 / 2 = 45
    expect(result.playerResult.value).toBe(33);
    expect(result.enemyResult.value).toBe(45);
    // Player HP: 120 - 45 = 75
    // Enemy HP: 140 - 33 = 107
    expect(result.updatedPlayerFamiliar.currentHp).toBe(75);
    expect(result.updatedEnemyFamiliar.currentHp).toBe(107);
  });

  it("returns 0 damage and Unknown ability description for a nonexistent abilityId", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: ActionType.Ability, abilityId: "nonexistent" },
      makeFamiliar(),
      makeFamiliar(),
      { type: ActionType.Attack },
      rng,
    );
    expect(result.playerResult.effectType).toBe(EffectType.Damage);
    expect(result.playerResult.value).toBe(0);
    expect(result.playerResult.isCritical).toBe(false);
    expect(result.playerResult.description).toBe("Unknown ability used");
  });
});
