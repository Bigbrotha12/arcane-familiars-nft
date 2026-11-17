import { describe, expect, it } from 'vitest';
import { buildTeamEntry } from './team';
import type { RosterEntry } from '@/game';

function rosterEntry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id: 'whiteDog',
    level: 1,
    xp: 0,
    inParty: true,
    ...overrides,
  };
}

describe('buildTeamEntry', () => {
  it('marks learned abilities and shows when the rest unlock', () => {
    const entry = buildTeamEntry(rosterEntry({ level: 3, xp: 25 }));
    const byId = new Map(entry.abilities.map((ability) => [ability.id, ability]));

    expect(byId.get('brave')).toMatchObject({ learned: true, unlockLevel: 1 });
    expect(byId.get('sturdy')).toMatchObject({ learned: true, unlockLevel: 3 });
    // Affinity signature at Lv 9, rank-II variants at Lv 12.
    expect(byId.get('sunburst')).toMatchObject({ learned: false, unlockLevel: 9 });
    expect(byId.get('brave_2')).toMatchObject({ learned: false, unlockLevel: 12, name: 'Brave II' });

    expect(entry.xp).toBe(25);
    expect(entry.xpToNext).toBeGreaterThan(0);
  });

  it('applies the equipped charm and reports the bonus per stat', () => {
    const entry = buildTeamEntry(
      rosterEntry({
        level: 1,
        charm: { name: 'Ember Band', modsLabel: '+10% Attack', mods: [{ stat: 'attack', pct: 10 }] },
      })
    );
    const stats = new Map(entry.stats.map((stat) => [stat.key, stat]));

    // White Dog base attack is 55; +10% rounds to 61.
    expect(stats.get('attack')).toMatchObject({ value: 61, bonus: 6 });
    expect(stats.get('hp')).toMatchObject({ value: 120, bonus: 0 });
    expect(entry.charm).toEqual({ name: 'Ember Band', modsLabel: '+10% Attack' });
  });

  it('reports passive tiers as locked below Lv 5', () => {
    const entry = buildTeamEntry(rosterEntry({ level: 1 }));

    expect(entry.passive).toBeDefined();
    expect(entry.passive?.tier).toBe(0);
    expect(entry.passive?.tiers).toHaveLength(4);
    expect(entry.passive?.tiers.every((tier) => !tier.unlocked && !tier.current)).toBe(true);
    expect(entry.passive?.tiers[0].description).toBeTruthy();
  });

  it('highlights the current passive tier and dims the next ones', () => {
    const entry = buildTeamEntry(rosterEntry({ level: 10 }));
    const tiers = entry.passive?.tiers ?? [];

    expect(entry.passive?.tier).toBe(2);
    expect(tiers.map((tier) => tier.unlocked)).toEqual([true, true, false, false]);
    expect(tiers.map((tier) => tier.current)).toEqual([false, true, false, false]);
    expect(tiers.map((tier) => tier.level)).toEqual([5, 10, 15, 20]);
  });
});
