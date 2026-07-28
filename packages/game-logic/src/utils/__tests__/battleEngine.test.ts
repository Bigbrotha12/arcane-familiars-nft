import { describe, it, expect, beforeEach } from "vitest";
import { getEffectiveStat, calculateDamage, applyStatusEffects, checkBattleOutcome, applyDefend, resolveTurn } from "../battleEngine";
import { seededRandom } from "../mathUtils";
import { getFamiliar } from "../../data/familiars";
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
    expect(getEffectiveStat(100, [], "attack")).toBe(100);
  });

  it("applies a single 1.5x buff", () => {
    const effects: StatusEffect[] = [
      { abilityId: "sturdy", type: "buff", stat: "defense", value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, "defense")).toBe(150);
  });

  it("multiplies multiple buffs together", () => {
    const effects: StatusEffect[] = [
      { abilityId: "a", type: "buff", stat: "attack", value: 1.5, turnsRemaining: 2 },
      { abilityId: "b", type: "buff", stat: "attack", value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, "attack")).toBe(225);
  });

  it("reduces stat for a debuff below 1", () => {
    const effects: StatusEffect[] = [
      { abilityId: "shadowstrike", type: "debuff", stat: "defense", value: 0.8, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, "defense")).toBe(80);
  });

  it("returns minimum 1 even with a severe debuff on a low stat", () => {
    const effects: StatusEffect[] = [
      { abilityId: "x", type: "debuff", stat: "attack", value: 0.1, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(1, effects, "attack")).toBe(1);
  });

  it("only considers effects whose stat name matches", () => {
    const effects: StatusEffect[] = [
      { abilityId: "sturdy", type: "buff", stat: "defense", value: 1.5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, "attack")).toBe(100);
  });

  it("ignores dot and hot effects since they are not buff/debuff", () => {
    const effects: StatusEffect[] = [
      { abilityId: "naturabless", type: "hot", stat: "hp", value: 5, turnsRemaining: 2 },
    ];
    expect(getEffectiveStat(100, effects, "hp")).toBe(100);
  });
});

describe("calculateDamage", () => {
  it("computes basic attack damage with multiplier 1.0", () => {
    const rng = makeRng(42);
    const attacker = makeFamiliar();
    const defender = makeFamiliar();
    const result = calculateDamage(attacker, defender, 1.0, false, rng);
    // 55 * 1.0 - 70 / 2 = 20
    expect(result.damage).toBe(20);
    expect(result.isCritical).toBe(false);
  });

  it("uses arcane stat for arcane-scaled abilities", () => {
    const rng = makeRng(42);
    const attacker = makeFamiliar(); // arcane = 45
    const defender = makeFamiliar(); // defense = 70
    const result = calculateDamage(attacker, defender, 2.0, true, rng);
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
    const result = calculateDamage(makeFamiliar(), defender, 1.0, false, () => 0.5);
    expect(result.damage).toBe(1);
  });

  it("applies 1.5x critical multiplier when rng produces a value below 0.1", () => {
    const rng = makeRng(7);
    const attacker = makeFamiliar();
    const defender = makeFamiliar();
    const result = calculateDamage(attacker, defender, 1.0, false, rng);
    // 55 * 1.0 - 35 = 20; 20 * 1.5 = 30
    expect(result.damage).toBe(30);
    expect(result.isCritical).toBe(true);
  });

  it("does not crit when rng value is 0.1 or above", () => {
    const rng = makeRng(42);
    const result = calculateDamage(makeFamiliar(), makeFamiliar(), 1.0, false, rng);
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
        { abilityId: "naturabless", type: "hot", stat: "hp", value: 10, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(120);
  });

  it("subtracts HP from DoT effects but clamps to 0", () => {
    const familiar = makeFamiliar({
      currentHp: 3,
      statusEffects: [
        { abilityId: "burn", type: "dot", stat: "hp", value: 10, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.currentHp).toBe(0);
  });

  it("decrements turnsRemaining on all effects by 1", () => {
    const familiar = makeFamiliar({
      statusEffects: [
        { abilityId: "sturdy", type: "buff", stat: "defense", value: 1.5, turnsRemaining: 2 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.statusEffects[0].turnsRemaining).toBe(1);
  });

  it("removes effects whose turnsRemaining reaches 0", () => {
    const familiar = makeFamiliar({
      statusEffects: [
        { abilityId: "sturdy", type: "buff", stat: "defense", value: 1.5, turnsRemaining: 1 },
      ],
    });
    const result = applyStatusEffects(familiar);
    expect(result.statusEffects).toHaveLength(0);
  });
});

describe("checkBattleOutcome", () => {
  it("returns win when enemy HP is 0 or below", () => {
    expect(checkBattleOutcome(makeFamiliar(), makeFamiliar({ currentHp: 0 }))).toBe("win");
  });

  it("returns lose when player HP is 0 or below", () => {
    expect(checkBattleOutcome(makeFamiliar({ currentHp: 0 }), makeFamiliar())).toBe("lose");
  });

  it("returns continue when both familiars have HP above 0", () => {
    expect(checkBattleOutcome(makeFamiliar({ currentHp: 50 }), makeFamiliar({ currentHp: 30 }))).toBe("continue");
  });
});

describe("applyDefend", () => {
  it("adds a defense buff with 1.5x value and 1 turn duration", () => {
    const result = applyDefend(makeFamiliar());
    expect(result.statusEffects).toHaveLength(1);
    expect(result.statusEffects[0]).toEqual({
      abilityId: "defend",
      type: "buff",
      stat: "defense",
      value: 1.5,
      turnsRemaining: 1,
    });
  });
});

describe("resolveTurn", () => {
  it("returns damage effectType when the player attacks", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: "attack" },
      makeFamiliar(),
      makeFamiliar(),
      { type: "attack" },
      rng,
    );
    expect(result.playerResult.effectType).toBe("damage");
    expect(result.playerResult.value).toBe(20);
    expect(result.playerResult.isCritical).toBe(false);
  });

  it("returns damage effectType when the enemy attacks", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: "attack" },
      makeFamiliar(),
      makeFamiliar(),
      { type: "attack" },
      rng,
    );
    expect(result.enemyResult.effectType).toBe("damage");
    expect(result.enemyResult.value).toBe(20);
  });

  it("returns damage (0 value) when the player defends (defend is not handled in executeAction)", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: "defend" },
      makeFamiliar(),
      makeFamiliar(),
      { type: "attack" },
      rng,
    );
    expect(result.playerResult.effectType).toBe("damage");
    expect(result.playerResult.value).toBe(0);
    expect(result.playerResult.description).toBe("No action taken");
  });

  it("deals damage when the player uses the brave ability", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: "ability", abilityId: "brave" },
      makeFamiliar(),
      makeFamiliar(),
      { type: "attack" },
      rng,
    );
    expect(result.playerResult.effectType).toBe("damage");
    // 55 * 1.5 - 70 / 2 = 82.5 - 35 = 47.5 -> Math.round -> 48
    expect(result.playerResult.value).toBe(48);
  });

  it("heals when the player uses the healpulse ability", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: "ability", abilityId: "healpulse" },
      makeFamiliar(),
      makeFamiliar(),
      { type: "attack" },
      rng,
    );
    expect(result.playerResult.effectType).toBe("heal");
    // Math.round(120 * 0.3) = 36
    expect(result.playerResult.value).toBe(36);
  });

  it("returns 0 damage and Unknown ability description for a nonexistent abilityId", () => {
    const rng = makeRng(42);
    const result = resolveTurn(
      { type: "ability", abilityId: "nonexistent" },
      makeFamiliar(),
      makeFamiliar(),
      { type: "attack" },
      rng,
    );
    expect(result.playerResult.effectType).toBe("damage");
    expect(result.playerResult.value).toBe(0);
    expect(result.playerResult.isCritical).toBe(false);
    expect(result.playerResult.description).toBe("Unknown ability used");
  });
});
