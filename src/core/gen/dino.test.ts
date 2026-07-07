import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_LIST, SPECIES } from '../../data/index';
import { createRng } from '../rng';
import { ALPHA_STAT_MULTIPLIER, APEX_STAT_MULTIPLIER, DINO_MAX_LEVEL } from '../balance';
import { deriveEnemyStats } from '../stats';
import { generateEncounter, generateStarter, generateTamedDino, generateWildCombatant, pickWildSpecies } from './dino';
import type { Combatant } from '../types';

const SEEDS = Array.from({ length: 150 }, (_, i) => i * 7 + 1);

describe('generateWildCombatant', () => {
  it('jitters level by at most ±1 around targetLevel', () => {
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      const c = generateWildCombatant({ biome: 'cinder_peaks', tier: 1, targetLevel: 10, rng });
      expect(c.level).toBeGreaterThanOrEqual(9);
      expect(c.level).toBeLessThanOrEqual(11);
    }
  });

  it('clamps level to [1, DINO_MAX_LEVEL] at the extremes', () => {
    for (const seed of SEEDS) {
      const low = generateWildCombatant({ biome: 'cinder_peaks', tier: 1, targetLevel: 1, rng: createRng(seed) });
      expect(low.level).toBeGreaterThanOrEqual(1);
      const high = generateWildCombatant({ biome: 'cinder_peaks', tier: 4, targetLevel: DINO_MAX_LEVEL, rng: createRng(seed) });
      expect(high.level).toBeLessThanOrEqual(DINO_MAX_LEVEL);
    }
  });

  it('always picks a species from the biome wild pool (non-apex)', () => {
    for (const biome of BIOME_LIST) {
      for (const seed of SEEDS.slice(0, 30)) {
        const c = generateWildCombatant({ biome: biome.id, tier: 2, targetLevel: 12, rng: createRng(seed) });
        expect(biome.speciesPool).toContain(c.species);
      }
    }
  });

  it('aspectBias actually biases species selection (statistical, weighted 3x)', () => {
    // stormreach_cliffs: 4/6 pool species share the bias -> weighted expectation 12/14 ≈ 0.857,
    // vs a uniform-pool baseline of 4/6 ≈ 0.667. A clear, checkable gap.
    const biome = BIOMES['stormreach_cliffs']!;
    const rng = createRng(12345);
    let biased = 0;
    const trials = 3000;
    for (let i = 0; i < trials; i++) {
      const id = pickWildSpecies(biome, rng);
      const species = SPECIES[id]!;
      if (biome.aspectBias.includes(species.aspect)) biased++;
    }
    const fraction = biased / trials;
    expect(fraction).toBeGreaterThan(0.75);
    expect(fraction).toBeLessThan(0.95);
  });

  it('apex uses the biome apex species and applies APEX_STAT_MULTIPLIER on top of deriveEnemyStats', () => {
    for (const biome of BIOME_LIST) {
      const c = generateWildCombatant({ biome: biome.id, tier: 2, targetLevel: 15, rng: createRng(99), apex: true });
      expect(c.species).toBe(biome.apexSpecies);
      expect(c.tameable).toBe(false);
      const bossSpecies = SPECIES[biome.apexSpecies]!;
      const base = deriveEnemyStats(bossSpecies, c.level, 2);
      expect(c.stats.hp).toBe(Math.round(base.hp * APEX_STAT_MULTIPLIER));
      expect(c.stats.atk).toBe(Math.round(base.atk * APEX_STAT_MULTIPLIER));
      expect(c.stats.def).toBe(Math.round(base.def * APEX_STAT_MULTIPLIER));
      expect(c.stats.spd).toBe(Math.round(base.spd * APEX_STAT_MULTIPLIER));
    }
  });

  it('alpha applies ALPHA_STAT_MULTIPLIER on top of deriveEnemyStats', () => {
    const c = generateWildCombatant({ biome: 'frostfen', tier: 1, targetLevel: 8, rng: createRng(5), alpha: true });
    const species = SPECIES[c.species]!;
    const base = deriveEnemyStats(species, c.level, 1);
    expect(c.stats.hp).toBe(Math.round(base.hp * ALPHA_STAT_MULTIPLIER));
  });

  it('moves are always a subset of the learnset, capped at 4', () => {
    for (const seed of SEEDS) {
      const c = generateWildCombatant({ biome: 'miregloom', tier: 3, targetLevel: 20, rng: createRng(seed) });
      const species = SPECIES[c.species]!;
      const learnsetIds = new Set(species.learnset.map((e) => e.move));
      expect(c.moves.length).toBeGreaterThan(0);
      expect(c.moves.length).toBeLessThanOrEqual(4);
      for (const move of c.moves) expect(learnsetIds.has(move)).toBe(true);
    }
  });

  it('non-apex, non-boss wilds are tameable', () => {
    const c = generateWildCombatant({ biome: 'verdant_maw', tier: 1, targetLevel: 5, rng: createRng(3) });
    expect(c.tameable).toBe(true);
    expect(c.alphaMods).toEqual([]);
  });
});

describe('generateEncounter', () => {
  it('battle: scales 1:1 with packSize (1v1/2v2/3v3), all tameable, no alpha mods', () => {
    for (const packSize of [1, 2, 3]) {
      const enemies = generateEncounter({ biome: 'cinder_peaks', tier: 1, packAvgLevel: 5, packSize, kind: 'battle', rng: createRng(1) });
      expect(enemies).toHaveLength(packSize);
      for (const e of enemies) {
        expect(e.tameable).toBe(true);
        expect(e.alphaMods).toEqual([]);
      }
    }
  });

  it('battle: a packSize-1 encounter targets exactly SMALL_PACK_LEVEL_OFFSET below a packSize-3 one for the same seed', () => {
    // Both start from a fresh rng(seed) and the first rng draw in each case is the
    // same jitter roll (generateWildCombatant's first op), so the level gap between
    // packSize 1 and packSize 3 is exactly SMALL_PACK_LEVEL_OFFSET, deterministically.
    for (let seed = 0; seed < 100; seed++) {
      const solo = generateEncounter({ biome: 'cinder_peaks', tier: 1, packAvgLevel: 10, packSize: 1, kind: 'battle', rng: createRng(seed) });
      const trio = generateEncounter({ biome: 'cinder_peaks', tier: 1, packAvgLevel: 10, packSize: 3, kind: 'battle', rng: createRng(seed) });
      expect(solo[0]!.level).toBe(trio[0]!.level - 1);
    }
  });

  it('alpha: 1 alpha (with mods) + (packSize - 1) normal wilds, unless summonAdd bumps it by 1', () => {
    for (const packSize of [1, 2, 3]) {
      for (const seed of SEEDS) {
        const enemies = generateEncounter({ biome: 'sunken_coast', tier: 3, packAvgLevel: 10, packSize, kind: 'alpha', rng: createRng(seed) });
        const alphas = enemies.filter((e) => e.alphaMods.length > 0);
        expect(alphas).toHaveLength(1);
        expect(alphas[0]!.tameable).toBe(true);
        const hasSummonAdd = alphas[0]!.alphaMods.includes('pack_leader');
        expect(enemies.length).toBe(hasSummonAdd ? packSize + 1 : packSize);
      }
    }
  });

  it('summonAdd (Pack Leader) actually spawns an extra wild ally at least once over many seeds', () => {
    let sawFour = false;
    let sawThree = false;
    for (let seed = 0; seed < 400; seed++) {
      const enemies = generateEncounter({ biome: 'sunken_coast', tier: 4, packAvgLevel: 10, packSize: 3, kind: 'alpha', rng: createRng(seed) });
      if (enemies.length === 4) sawFour = true;
      if (enemies.length === 3) sawThree = true;
      if (sawFour && sawThree) break;
    }
    expect(sawFour).toBe(true);
    expect(sawThree).toBe(true);
  });

  it('apex: the boss + fixed apex mods, with an escort only at tier >= 3, regardless of packSize', () => {
    for (const packSize of [1, 3]) {
      const t1 = generateEncounter({ biome: 'cinder_peaks', tier: 1, packAvgLevel: 20, packSize, kind: 'apex', rng: createRng(1) });
      expect(t1).toHaveLength(1);
      expect(t1[0]!.species).toBe('pyrelord_rex');
      expect(t1[0]!.alphaMods.length).toBeGreaterThan(0);
      expect(t1[0]!.tameable).toBe(false);

      const t3 = generateEncounter({ biome: 'cinder_peaks', tier: 3, packAvgLevel: 20, packSize, kind: 'apex', rng: createRng(1) });
      expect(t3.length).toBeGreaterThanOrEqual(2);
      expect(t3[0]!.species).toBe('pyrelord_rex');
    }
  });
});

describe('generateTamedDino', () => {
  it('preserves species/level/trait/appearanceSeed, rolls a fresh quirk, and converts HP fraction', () => {
    const combatant: Combatant = generateWildCombatant({ biome: 'frostfen', tier: 1, targetLevel: 6, rng: createRng(42) });
    combatant.currentHp = Math.round(combatant.stats.hp * 0.2);
    const dino = generateTamedDino(combatant, createRng(7));
    const species = SPECIES[combatant.species]!;

    expect(dino.species).toBe(combatant.species);
    expect(dino.level).toBe(combatant.level);
    expect(dino.trait).toBe(combatant.trait);
    expect(dino.appearanceSeed).toBe(combatant.appearanceSeed);
    expect(dino.nickname).toBe(species.name);
    expect(dino.xp).toBe(0);
    expect(dino.gear).toEqual({});
    expect(dino.currentHpPercent).toBeCloseTo(0.2, 1);
    expect(['hp', 'atk', 'def', 'spd']).toContain(dino.quirk.stat);
    expect(dino.quirk.percent).toBeGreaterThanOrEqual(5);
    expect(dino.quirk.percent).toBeLessThanOrEqual(10);
    expect(dino.alphaTrait).toBeUndefined();
  });

  it('keeps exactly one alpha mod as alphaTrait when the source had several', () => {
    const combatant: Combatant = generateWildCombatant({ biome: 'sunken_coast', tier: 4, targetLevel: 10, rng: createRng(8), alpha: true });
    combatant.alphaMods = ['stoneskin', 'thorned', 'frenzied'];
    const dino = generateTamedDino(combatant, createRng(9));
    expect(dino.alphaTrait).toBeDefined();
    expect(combatant.alphaMods).toContain(dino.alphaTrait);
  });
});

describe('generateStarter', () => {
  it('is level 3 with a rolled quirk/trait and learnset moves so far', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const dino = generateStarter('emberfang', createRng(seed));
      const species = SPECIES['emberfang']!;
      expect(dino.level).toBe(3);
      expect(dino.xp).toBe(0);
      expect(dino.gear).toEqual({});
      expect(dino.currentHpPercent).toBe(1);
      expect(species.traitPool).toContain(dino.trait);
      const learnsetIds = new Set(species.learnset.filter((e) => e.level <= 3).map((e) => e.move));
      for (const move of dino.moves) expect(learnsetIds.has(move)).toBe(true);
      expect(dino.moves.length).toBeGreaterThan(0);
    }
  });
});
