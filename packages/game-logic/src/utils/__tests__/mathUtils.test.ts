import { describe, it, expect } from "vitest";
import { seededRandom, randomInRange, weightedRandom } from "../mathUtils";

function setupRng(seed = 42) {
  return seededRandom(seed);
}

describe("seededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = setupRng(42);
    const b = setupRng(42);
    for (let i = 0; i < 5; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = setupRng(42);
    const b = setupRng(99);
    const valsA = Array.from({ length: 5 }, () => a());
    const valsB = Array.from({ length: 5 }, () => b());
    expect(valsA).not.toEqual(valsB);
  });

  it("yields values in [0, 1)", () => {
    const rng = setupRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("randomInRange", () => {
  it("returns values within [min, max]", () => {
    const rng = setupRng(42);
    rng();
    for (let i = 0; i < 50; i++) {
      const v = randomInRange(rng, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("returns 0 when min and max are both 0", () => {
    expect(randomInRange(setupRng(42), 0, 0)).toBe(0);
  });

  it("returns 1 when min and max are both 1", () => {
    expect(randomInRange(setupRng(42), 1, 1)).toBe(1);
  });

  it("produces a known value for seed 42", () => {
    const rng = setupRng(42);
    expect(randomInRange(rng, 3, 7)).toBe(6);
  });
});

describe("weightedRandom", () => {
  it("always picks index 0 when only it has weight", () => {
    const rng = setupRng(42);
    const entries = [{ weight: 1 }, { weight: 0 }];
    for (let i = 0; i < 20; i++) {
      expect(weightedRandom(rng, entries)).toBe(0);
    }
  });

  it("always picks index 2 when only it has weight", () => {
    const rng = setupRng(42);
    const entries = [{ weight: 0 }, { weight: 0 }, { weight: 1 }];
    for (let i = 0; i < 20; i++) {
      expect(weightedRandom(rng, entries)).toBe(2);
    }
  });

  it("distributes across balanced weights deterministically", () => {
    const rng = setupRng(42);
    const entries = [{ weight: 1 }, { weight: 1 }, { weight: 1 }];
    const counts = [0, 0, 0];
    for (let i = 0; i < 300; i++) {
      counts[weightedRandom(rng, entries)]++;
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBeGreaterThan(0);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(300);
  });
});
