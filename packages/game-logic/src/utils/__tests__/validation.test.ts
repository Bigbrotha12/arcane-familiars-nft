import { describe, it, expect } from "vitest";
import { validateBattleAction, validateDungeonExplore, validateParty } from "../validation";
import { getFamiliar } from "../../data/familiars";
import { getAbility } from "../../data/abilities";
import { generateDungeon } from "../dungeonEngine";
import { AREAS } from "../../data/areas";
import { ActionType, BattleResult } from "../../types/battle";
import type { BattleAction, BattleState } from "../../types/battle";
import type { DungeonState, Room } from "../../types/exploration";

function createBattleState(overrides: Partial<BattleState> = {}): BattleState {
  const familiar = getFamiliar("whiteDog")!;
  return {
    id: "test-battle",
    playerFamiliar: {
      familiarData: familiar,
      currentHp: 120,
      currentMp: 80,
      statusEffects: [],
      cooldowns: {},
      isAlly: true,
    },
    enemyFamiliar: {
      familiarData: getFamiliar("meadowGuardian")!,
      currentHp: 240,
      currentMp: 160,
      statusEffects: [],
      cooldowns: {},
      isAlly: false,
    },
    isBoss: false,
    turnCount: 1,
    status: BattleResult.Active,
    ...overrides,
  };
}

describe("validateBattleAction", () => {
  it("returns invalid when battle is not active", () => {
    const state = createBattleState({ status: BattleResult.Won });
    const action: BattleAction = { type: ActionType.Attack };
    expect(validateBattleAction(action, state)).toEqual({
      valid: false,
      error: "Battle is not active",
    });
  });

  describe("attack", () => {
    it("is valid", () => {
      const state = createBattleState();
      const action: BattleAction = { type: ActionType.Attack };
      expect(validateBattleAction(action, state)).toEqual({ valid: true });
    });
  });

  describe("ability", () => {
    it("requires abilityId", () => {
      const state = createBattleState();
      const action: BattleAction = { type: ActionType.Ability };
      expect(validateBattleAction(action, state)).toEqual({
        valid: false,
        error: "Ability ID is required",
      });
    });

    it("rejects unknown ability", () => {
      const state = createBattleState();
      const action: BattleAction = { type: ActionType.Ability, abilityId: "nonexistent" };
      expect(validateBattleAction(action, state)).toEqual({
        valid: false,
        error: "Unknown ability: nonexistent",
      });
    });

    it("rejects ability with insufficient MP", () => {
      const state = createBattleState({
        playerFamiliar: {
          ...createBattleState().playerFamiliar,
          currentMp: 5,
        },
      });
      const action: BattleAction = { type: ActionType.Ability, abilityId: "fireball" };
      const ability = getAbility("fireball")!;
      expect(validateBattleAction(action, state)).toEqual({
        valid: false,
        error: `Not enough MP. Need ${ability.mpCost}, have 5`,
      });
    });

    it("rejects ability on cooldown", () => {
      const state = createBattleState({
        playerFamiliar: {
          ...createBattleState().playerFamiliar,
          cooldowns: { brave: 1 },
        },
      });
      const action: BattleAction = { type: ActionType.Ability, abilityId: "brave" };
      expect(validateBattleAction(action, state)).toEqual({
        valid: false,
        error: "Ability on cooldown for 1 turns",
      });
    });

    it("is valid when enough MP and no cooldown", () => {
      const state = createBattleState();
      const action: BattleAction = { type: ActionType.Ability, abilityId: "brave" };
      expect(validateBattleAction(action, state)).toEqual({ valid: true });
    });
  });

  describe("defend", () => {
    it("is valid", () => {
      const state = createBattleState();
      const action: BattleAction = { type: ActionType.Defend };
      expect(validateBattleAction(action, state)).toEqual({ valid: true });
    });
  });

  describe("item", () => {
    it("requires itemId", () => {
      const state = createBattleState();
      const action: BattleAction = { type: ActionType.Item };
      expect(validateBattleAction(action, state)).toEqual({
        valid: false,
        error: "Item ID is required",
      });
    });

    it("is valid with itemId", () => {
      const state = createBattleState();
      const action: BattleAction = { type: ActionType.Item, itemId: "potion_small" };
      expect(validateBattleAction(action, state)).toEqual({ valid: true });
    });
  });

  describe("run", () => {
    it("is valid in non-boss battle", () => {
      const state = createBattleState({ isBoss: false });
      const action: BattleAction = { type: ActionType.Run };
      expect(validateBattleAction(action, state)).toEqual({ valid: true });
    });

    it("is invalid in boss battle", () => {
      const state = createBattleState({ isBoss: true });
      const action: BattleAction = { type: ActionType.Run };
      expect(validateBattleAction(action, state)).toEqual({
        valid: false,
        error: "Cannot run from a boss battle",
      });
    });
  });

  it("rejects unknown action type", () => {
    const state = createBattleState();
    const action = { type: "dance" } as unknown as BattleAction;
    expect(validateBattleAction(action, state)).toEqual({
      valid: false,
      error: "Unknown action type: dance",
    });
  });
});

describe("validateDungeonExplore", () => {
  function createDungeon(): DungeonState {
    return generateDungeon(AREAS.verdantMeadow, 42);
  }

  it("returns invalid when current room is not found", () => {
    const dungeon = createDungeon();
    dungeon.currentRoomId = "nonexistent";
    expect(validateDungeonExplore("room_1", dungeon)).toEqual({
      valid: false,
      error: "Current room not found",
    });
  });

  it("returns invalid when target room is not found", () => {
    const dungeon = createDungeon();
    expect(validateDungeonExplore("nonexistent", dungeon)).toEqual({
      valid: false,
      error: "Target room not found",
    });
  });

  it("returns invalid when rooms are not connected", () => {
    const dungeon = createDungeon();
    expect(validateDungeonExplore("room_2", dungeon)).toEqual({
      valid: false,
      error: "Cannot move to that room from current position",
    });
  });

  it("is valid when moving to an adjacent room via exit", () => {
    const dungeon = createDungeon();
    const currentRoom = dungeon.rooms[dungeon.currentRoomId];
    const exit = currentRoom.exits[0];
    expect(exit).toBeDefined();
    expect(validateDungeonExplore(exit.roomId, dungeon)).toEqual({
      valid: true,
    });
  });
});

describe("validateParty", () => {
  const collection = ["whiteDog", "yellowFighter", "aquaSprite", "leafBunny"];

  it("rejects empty party", () => {
    expect(validateParty([], collection)).toEqual({
      valid: false,
      error: "Party must have exactly 2 familiars",
    });
  });

  it("rejects party with one familiar", () => {
    expect(validateParty(["whiteDog"], collection)).toEqual({
      valid: false,
      error: "Party must have exactly 2 familiars",
    });
  });

  it("rejects party with three familiars", () => {
    expect(validateParty(["whiteDog", "yellowFighter", "aquaSprite"], collection)).toEqual({
      valid: false,
      error: "Party must have exactly 2 familiars",
    });
  });

  it("rejects duplicate familiars", () => {
    expect(validateParty(["whiteDog", "whiteDog"], collection)).toEqual({
      valid: false,
      error: "Cannot have duplicate familiars in party",
    });
  });

  it("rejects familiar not in collection", () => {
    expect(validateParty(["whiteDog", "nonexistent"], collection)).toEqual({
      valid: false,
      error: "You don't own familiar: nonexistent",
    });
  });

  it("is valid with two owned distinct familiars", () => {
    expect(validateParty(["whiteDog", "yellowFighter"], collection)).toEqual({
      valid: true,
    });
  });
});
