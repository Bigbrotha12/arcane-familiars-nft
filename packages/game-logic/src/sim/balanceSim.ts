/**
 * Balance simulation harness. Plays battles with the real engine + enemy AI and
 * a simple, sensible player policy, mirroring the backend battle flow (speed
 * order, cooldowns, per-turn RNG, two-member party with KO relay, HP/MP carried
 * between fights). Used by `balance.report.test.ts` to print win-rate tables —
 * tune data against numbers, not hunches.
 */
import { ActionType, Outcome, type BattleAction, type BattleFamiliar } from '@/types/battle';
import { AREAS } from '@/data/areas';
import { getFamiliar } from '@/data/familiars';
import { getAbility, EffectType, Target } from '@/data/abilities';
import { resolveTurn, checkBattleOutcome, updateCooldowns } from '@/utils/battleEngine';
import { selectEnemyAction } from '@/utils/enemyAI';
import { scaleEnemy } from '@/utils/dungeonEngine';
import { scaleFamiliarStats } from '@/utils/progression';
import { seededRandom, randomInRange } from '@/utils/mathUtils';
import { affinityMultiplier } from '@/data/balance';

export interface PartyMember {
  id: string;
  level: number;
  hp: number;
  mp: number;
}

function makeCombatant(id: string, level: number, isAlly: boolean, asEnemy = false): BattleFamiliar {
  const base = getFamiliar(id);
  if (!base) throw new Error(`Unknown familiar ${id}`);
  const data = asEnemy ? scaleEnemy(base, level) : { ...base, stats: scaleFamiliarStats(base.stats, level) };
  return {
    uid: `${isAlly ? 'ally' : 'enemy'}-${id}`,
    familiarData: data,
    currentHp: data.stats.hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly,
  };
}

/** A competent-but-not-perfect player: heal when low, otherwise hit as hard as possible. */
export function playerPolicy(player: BattleFamiliar, enemy: BattleFamiliar): BattleAction {
  const usable = player.familiarData.abilities
    .map((id) => getAbility(id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .filter((a) => player.currentMp >= a.mpCost && (player.cooldowns[a.id] ?? 0) <= 0);

  // A charged boss is about to unleash a heavy hit: guard it.
  if (enemy.charged) return { type: ActionType.Defend, targetId: player.uid };

  const hpPct = player.currentHp / player.familiarData.stats.maxHp;
  if (hpPct < 0.4) {
    const heal = usable.find((a) => a.effectType === EffectType.Heal);
    if (heal) return { type: ActionType.Ability, abilityId: heal.id, targetId: player.uid };
  }

  const damaging = usable
    .filter((a) => a.effectType === EffectType.Damage || a.effectType === EffectType.Dot)
    .sort((a, b) => b.multiplier - a.multiplier);
  if (damaging[0]) return { type: ActionType.Ability, abilityId: damaging[0].id, targetId: enemy.uid };

  // Open with a self-buff when healthy and unbuffed.
  const buffed = player.statusEffects.some((e) => e.type === EffectType.Buff);
  if (!buffed && hpPct > 0.6) {
    const buff = usable.find((a) => a.effectType === EffectType.Buff && a.target === Target.Self);
    if (buff) return { type: ActionType.Ability, abilityId: buff.id, targetId: player.uid };
  }

  return { type: ActionType.Attack, targetId: enemy.uid };
}

export interface BattleSimResult {
  won: boolean;
  turns: number;
}

/**
 * Fight one enemy with the party (mutated in place: HP/MP carry over). The lead
 * is the first living member; when it falls the other relays in.
 */
export function simulateBattle(
  party: PartyMember[],
  enemyId: string,
  enemyLevel: number,
  isBoss: boolean,
  seed: number,
  maxTurns = 200
): BattleSimResult {
  // Same enemy construction as the backend battle/start route.
  let enemy = makeCombatant(enemyId, enemyLevel, false, true);

  const enter = (member: PartyMember): BattleFamiliar => {
    const c = makeCombatant(member.id, member.level, true);
    c.currentHp = Math.min(member.hp, c.familiarData.stats.maxHp);
    c.currentMp = Math.min(member.mp, c.familiarData.stats.maxMp);
    return c;
  };

  // Lead with the living member that has the better affinity matchup — what a
  // player who read the encounter preview would do.
  const matchup = (m: PartyMember): number => {
    const mine = getFamiliar(m.id)!.affinity;
    const theirs = enemy.familiarData.affinity;
    return affinityMultiplier(mine, theirs) - affinityMultiplier(theirs, mine);
  };
  let activeIdx = -1;
  party.forEach((m, i) => {
    if (m.hp > 0 && (activeIdx < 0 || matchup(m) > matchup(party[activeIdx]))) activeIdx = i;
  });
  if (activeIdx < 0) return { won: false, turns: 0 };
  let player = enter(party[activeIdx]);

  for (let turn = 0; turn < maxTurns; turn++) {
    const rng = seededRandom(seed ^ (turn + 1));
    const action = playerPolicy(player, enemy);
    const enemyAction = selectEnemyAction(enemy, player, rng);
    const r = resolveTurn(action, player, enemy, enemyAction, rng);

    const playerActed = r.steps.some((s) => s.actorUid === player.uid);
    const enemyActed = r.steps.some((s) => s.actorUid === enemy.uid);
    player = updateCooldowns(
      r.updatedPlayerFamiliar,
      playerActed && action.type === ActionType.Ability ? action.abilityId : undefined
    );
    enemy = updateCooldowns(
      r.updatedEnemyFamiliar,
      enemyActed && enemyAction.type === ActionType.Ability ? enemyAction.abilityId : undefined
    );

    party[activeIdx].hp = Math.max(0, player.currentHp);
    party[activeIdx].mp = Math.max(0, player.currentMp);

    const outcome = checkBattleOutcome(player, enemy);
    if (outcome === Outcome.Win) return { won: true, turns: turn + 1 };
    if (outcome === Outcome.Loss) {
      const next = party.findIndex((m, i) => i !== activeIdx && m.hp > 0);
      if (next < 0) return { won: false, turns: turn + 1 };
      activeIdx = next;
      player = enter(party[activeIdx]);
    }
  }
  return { won: false, turns: maxTurns };
}

export function freshParty(ids: string[], level: number): PartyMember[] {
  return ids.map((id) => {
    const base = getFamiliar(id);
    if (!base) throw new Error(`Unknown familiar ${id}`);
    const stats = scaleFamiliarStats(base.stats, level);
    return { id, level, hp: stats.hp, mp: stats.mp };
  });
}

export interface AreaReport {
  areaId: string;
  partyLevel: number;
  /** Chance to win one random encounter from full health. */
  encounterWin: number;
  avgEncounterTurns: number;
  /** Average share of the party's total HP left after one won encounter. */
  hpLeftAfterEncounter: number;
  /** Chance to beat the boss from full health. */
  bossWinFresh: number;
  /** Chance to clear a whole run: a typical number of encounters, then the boss, no items. */
  runClear: number;
}

export function reportArea(areaId: string, partyIds: string[], partyLevel: number, trials = 400): AreaReport {
  const area = AREAS[areaId];
  if (!area) throw new Error(`Unknown area ${areaId}`);
  // Expected encounters on the main path: avg encounter chance is ~0.45 per normal room.
  const expectedEncounters = Math.max(1, Math.round((area.roomCount - 2) * 0.45));

  // Potion tier a player at this point can afford: small / medium / large.
  const areaIndex = Object.keys(AREAS).indexOf(areaId);
  const potionHeal = areaIndex < 2 ? 30 : areaIndex < 4 ? 60 : 100;

  let encWins = 0;
  let encTurns = 0;
  let hpLeft = 0;
  const bossLevel = area.levelRange[1];
  const maxPartyHp = freshParty(partyIds, partyLevel).reduce((sum, m) => sum + m.hp, 0);
  let bossWins = 0;
  let clears = 0;

  for (let t = 0; t < trials; t++) {
    const rng = seededRandom(0x9e3779b9 ^ (t * 2654435761));
    const pick = () => area.encounterPool[randomInRange(rng, 0, area.encounterPool.length - 1)];
    const level = () => randomInRange(rng, area.levelRange[0], area.levelRange[1]);
    const seed = () => Math.floor(rng() * 0xffffffff);

    const singleParty = freshParty(partyIds, partyLevel);
    const single = simulateBattle(singleParty, pick(), level(), false, seed());
    if (single.won) {
      encWins++;
      hpLeft += singleParty.reduce((sum, m) => sum + m.hp, 0) / maxPartyHp;
    }
    encTurns += single.turns;

    if (simulateBattle(freshParty(partyIds, partyLevel), area.bossId, bossLevel, true, seed()).won) bossWins++;

    // A run: encounters, a potion between fights when hurt (one per fight —
    // roughly what battle rewards pay for), the shrine at ~60% depth in
    // dungeons that have one, then the boss.
    const party = freshParty(partyIds, partyLevel);
    const maxOf = (m: PartyMember) => scaleFamiliarStats(getFamiliar(m.id)!.stats, m.level);
    const shrineAfter = area.roomCount >= 6 ? Math.round(expectedEncounters * 0.6) : -1;
    let alive = true;
    for (let e = 0; e < expectedEncounters && alive; e++) {
      alive = simulateBattle(party, pick(), level(), false, seed()).won;
      if (!alive) break;
      const hurt = party
        .filter((m) => m.hp > 0 && m.hp < maxOf(m).maxHp * 0.6)
        .sort((a, b) => a.hp / maxOf(a).maxHp - b.hp / maxOf(b).maxHp)[0];
      if (hurt) hurt.hp = Math.min(maxOf(hurt).maxHp, hurt.hp + potionHeal);
      if (e + 1 === shrineAfter) {
        for (const m of party) {
          if (m.hp <= 0) continue;
          const max = maxOf(m);
          m.hp = Math.min(max.maxHp, m.hp + Math.round(max.maxHp * 0.4));
          m.mp = Math.min(max.maxMp, m.mp + Math.round(max.maxMp * 0.4));
        }
      }
    }
    if (alive && simulateBattle(party, area.bossId, bossLevel, true, seed()).won) clears++;
  }

  return {
    areaId,
    partyLevel,
    encounterWin: encWins / trials,
    avgEncounterTurns: encTurns / trials,
    hpLeftAfterEncounter: encWins ? hpLeft / encWins : 0,
    bossWinFresh: bossWins / trials,
    runClear: clears / trials,
  };
}

/** Familiars a player can plausibly own on reaching an area: starters, earlier
 *  areas' boss rewards and recruitable encounters, plus this area's encounters. */
export function availableRoster(areaId: string): string[] {
  const ids = new Set<string>(['whiteDog', 'yellowFighter', 'aquaSprite']);
  for (const area of Object.values(AREAS)) {
    area.encounterPool.forEach((id) => ids.add(id));
    if (area.id === areaId) break;
    ids.add(area.baseFamiliar);
  }
  return [...ids];
}
