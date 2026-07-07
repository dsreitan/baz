import { describe, expect, it } from 'vitest';
import { ALPHA_MODS, ALPHA_MOD_LIST } from '../../data/index';
import { createRng } from '../rng';
import { apexMods, rollAlphaMods } from './alpha';
import type { WorldTier } from '../types';

const TIERS: WorldTier[] = [1, 2, 3, 4];
const EXPECTED_RANGE: Record<WorldTier, [number, number]> = {
  1: [1, 1],
  2: [1, 2],
  3: [2, 2],
  4: [2, 3],
};

describe('rollAlphaMods', () => {
  it('rolls a mod count within the expected range per tier, with no duplicates', () => {
    for (const tier of TIERS) {
      const [min, max] = EXPECTED_RANGE[tier];
      for (let seed = 0; seed < 200; seed++) {
        const mods = rollAlphaMods(tier, createRng(seed * 13 + tier));
        expect(mods.length).toBeGreaterThanOrEqual(min);
        expect(mods.length).toBeLessThanOrEqual(max);
        expect(new Set(mods).size).toBe(mods.length);
        for (const id of mods) expect(ALPHA_MODS[id]).toBeDefined();
      }
    }
  });

  it('actually reaches both ends of the range over many seeds (tier 2 and tier 4)', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 300; seed++) counts.add(rollAlphaMods(2, createRng(seed)).length);
    expect(counts.has(1)).toBe(true);
    expect(counts.has(2)).toBe(true);

    const counts4 = new Set<number>();
    for (let seed = 0; seed < 300; seed++) counts4.add(rollAlphaMods(4, createRng(seed)).length);
    expect(counts4.has(2)).toBe(true);
    expect(counts4.has(3)).toBe(true);
  });
});

describe('apexMods', () => {
  it('returns a fixed, growing thematic set per tier of only valid alpha mod ids', () => {
    const sizes: Record<WorldTier, number> = { 1: 1, 2: 2, 3: 3, 4: 4 };
    for (const tier of TIERS) {
      const mods = apexMods(tier);
      expect(mods.length).toBe(sizes[tier]);
      expect(new Set(mods).size).toBe(mods.length);
      for (const id of mods) expect(ALPHA_MOD_LIST.some((m) => m.id === id)).toBe(true);
      // deterministic / fixed, not rng-derived
      expect(apexMods(tier)).toEqual(mods);
    }
  });

  it('tier 4 apex mods are a superset (by inclusion) of tier 1-3, i.e. strictly escalating', () => {
    const t1 = apexMods(1);
    const t2 = apexMods(2);
    const t3 = apexMods(3);
    const t4 = apexMods(4);
    for (const id of t1) expect(t2).toContain(id);
    for (const id of t2) expect(t3).toContain(id);
    for (const id of t3) expect(t4).toContain(id);
  });
});
