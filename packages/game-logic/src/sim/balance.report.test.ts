import { describe, it, expect } from 'vitest';
import { AREAS } from '@/data/areas';
import { availableRoster, reportArea } from '@/sim/balanceSim';

/**
 * Balance regression guard + report.
 *
 * For every area it plays each pair from the roster a player could own by then
 * (simple policy, one potion between fights, the shrine) and checks the curve
 * stays inside deliberately wide bands. If a data change trips this, read the
 * printed table (run with --reporter=verbose) and retune rather than loosening
 * the band without thought.
 *
 * History: before these bands existed, encounters were ~100% wins at no cost
 * and every boss was a 0% wall, so the game could not progress past area 1.
 */
const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('balance curve', () => {
  it('keeps encounters winnable-but-costly and bosses hard-but-beatable in every area', () => {
    const lines = ['area             partyLv | enc med  hpLeft | boss med  best | run med  best  (best pair)'];

    for (const area of Object.values(AREAS)) {
      const roster = availableRoster(area.id);
      const pairs: string[][] = [];
      for (let i = 0; i < roster.length; i++) {
        for (let j = i + 1; j < roster.length; j++) pairs.push([roster[i], roster[j]]);
      }
      const [lo, hi] = area.levelRange;
      const mid = Math.round((lo + hi) / 2);

      for (const lvl of [lo, mid, hi]) {
        const reports = pairs.map((ids) => ({ ids, r: reportArea(area.id, ids, lvl, 60) }));
        const best = reports.reduce((a, b) => (b.r.runClear > a.r.runClear ? b : a));
        const encMed = median(reports.map((x) => x.r.encounterWin));
        const hpLeftMed = median(reports.map((x) => x.r.hpLeftAfterEncounter));
        const bossMed = median(reports.map((x) => x.r.bossWinFresh));
        const bossBest = Math.max(...reports.map((x) => x.r.bossWinFresh));

        lines.push(
          `${area.id.padEnd(16)} ${String(lvl).padStart(7)} |   ${pct(encMed)}    ${pct(hpLeftMed)} |     ${pct(
            bossMed
          )}  ${pct(bossBest)} |    ${pct(median(reports.map((x) => x.r.runClear)))}  ${pct(best.r.runClear)}  (${best.ids.join('+')})`
        );

        const where = `${area.id} @ party level ${lvl}`;
        if (lvl >= mid) {
          // Ordinary fights: a typical team should usually win…
          expect(encMed, `encounter win, ${where}`).toBeGreaterThanOrEqual(0.8);
          // …but pay for it, or there is no attrition and no reason to use items.
          expect(hpLeftMed, `HP left after an encounter, ${where}`).toBeLessThanOrEqual(0.9);
        }
        if (lvl === hi) {
          // Bosses at the top of the band: beatable by a typical team, not free.
          expect(bossMed, `median boss win, ${where}`).toBeGreaterThanOrEqual(0.15);
          expect(bossMed, `median boss win, ${where}`).toBeLessThanOrEqual(0.95);
          // A well-chosen team should be clearly rewarded.
          expect(bossBest, `best-pair boss win, ${where}`).toBeGreaterThanOrEqual(0.8);
        }
      }
    }
    console.log(lines.join('\n'));
  }, 600_000);
});
