import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng (mulberry32)', () => {
  it('is deterministic: same seed produces the same sequence', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() always returns a float in [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) is inclusive on both ends and deterministic', () => {
    const rngA = createRng(99);
    const rngB = createRng(99);
    for (let i = 0; i < 500; i++) {
      const va = rngA.int(5, 8);
      const vb = rngB.int(5, 8);
      expect(va).toBe(vb);
      expect(va).toBeGreaterThanOrEqual(5);
      expect(va).toBeLessThanOrEqual(8);
    }
  });

  it('int(n, n) always returns n', () => {
    const rng = createRng(7);
    for (let i = 0; i < 20; i++) {
      expect(rng.int(4, 4)).toBe(4);
    }
  });

  it('chance(0) is never true, chance(1) is always true', () => {
    const rng = createRng(1000);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
    }
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('pick() always returns an element from the array, deterministically', () => {
    const arr = ['a', 'b', 'c', 'd'] as const;
    const rngA = createRng(55);
    const rngB = createRng(55);
    for (let i = 0; i < 50; i++) {
      const pa = rngA.pick(arr);
      const pb = rngB.pick(arr);
      expect(pa).toBe(pb);
      expect(arr).toContain(pa);
    }
  });

  it('pick() throws on an empty array', () => {
    const rng = createRng(1);
    expect(() => rng.pick([])).toThrow();
  });

  it('shuffle() returns a permutation (same elements, same length) without mutating the input', () => {
    const original = [1, 2, 3, 4, 5];
    const rng = createRng(321);
    const shuffled = rng.shuffle(original);
    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort()).toEqual([...original].sort());
    expect(original).toEqual([1, 2, 3, 4, 5]); // untouched
  });

  it('shuffle() is deterministic for a given seed and stream position', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const rngA = createRng(2024);
    const rngB = createRng(2024);
    expect(rngA.shuffle(arr)).toEqual(rngB.shuffle(arr));
  });

  describe('fork()', () => {
    it('is deterministic for a given seed + label', () => {
      const parentA = createRng(500);
      const parentB = createRng(500);
      const childA = parentA.fork('expedition:cinder_peaks');
      const childB = parentB.fork('expedition:cinder_peaks');
      const seqA = Array.from({ length: 10 }, () => childA.next());
      const seqB = Array.from({ length: 10 }, () => childB.next());
      expect(seqA).toEqual(seqB);
    });

    it('different labels from the same parent seed produce different streams', () => {
      const parent = createRng(500);
      const childA = parent.fork('alpha_mods');
      const childB = parent.fork('loot_roll');
      const seqA = Array.from({ length: 10 }, () => childA.next());
      const seqB = Array.from({ length: 10 }, () => childB.next());
      expect(seqA).not.toEqual(seqB);
    });

    it('the same label from different parent seeds produces different streams', () => {
      const childA = createRng(1).fork('same-label');
      const childB = createRng(2).fork('same-label');
      const seqA = Array.from({ length: 10 }, () => childA.next());
      const seqB = Array.from({ length: 10 }, () => childB.next());
      expect(seqA).not.toEqual(seqB);
    });

    it('a forked stream is independent of the parent stream (parent draws do not perturb the fork)', () => {
      const parent = createRng(77);
      const forkBeforeDraws = parent.fork('x');
      const seqBefore = Array.from({ length: 5 }, () => forkBeforeDraws.next());

      const parent2 = createRng(77);
      // Advance the parent stream before forking with the same label.
      parent2.next();
      parent2.next();
      parent2.next();
      const forkAfterDraws = parent2.fork('x');
      const seqAfter = Array.from({ length: 5 }, () => forkAfterDraws.next());

      // fork() is defined off the RNG's own seed, not a mutable cursor, so
      // consuming the parent stream first must not change the fork's output.
      expect(seqAfter).toEqual(seqBefore);
    });
  });
});
