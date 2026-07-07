import { describe, expect, it } from 'vitest';
import { SPECIES } from '../data/index';
import { bondEffectsForPack, computeBonds, deriveEnemyStats, deriveStats, stageForLevel, type PackMember } from './stats';
import type { DinoInstance, ItemInstance } from './types';

function baseDino(overrides: Partial<DinoInstance> = {}): DinoInstance {
  return {
    uid: 'd1',
    species: 'emberfang',
    nickname: 'Test',
    level: 1,
    xp: 0,
    quirk: { stat: 'hp', percent: 0 },
    trait: 'keen_eye', // critChance trait: no effect on raw stats
    moves: ['ember_snap'],
    gear: {},
    appearanceSeed: 1,
    currentHpPercent: 1,
    ...overrides,
  };
}

describe('stageForLevel', () => {
  it('is juvenile below 10, adult 10-19, alpha 20+', () => {
    expect(stageForLevel(1)).toBe('juvenile');
    expect(stageForLevel(9)).toBe('juvenile');
    expect(stageForLevel(10)).toBe('adult');
    expect(stageForLevel(19)).toBe('adult');
    expect(stageForLevel(20)).toBe('alpha');
    expect(stageForLevel(30)).toBe('alpha');
  });
});

describe('deriveStats', () => {
  it('at level 1 with a neutral quirk/trait/gear, matches species base stats exactly', () => {
    const stats = deriveStats(baseDino());
    const species = SPECIES['emberfang']!;
    expect(stats).toEqual(species.baseStats);
  });

  it('applies growth × (level - 1) before any percent bonuses', () => {
    const dino = baseDino({ level: 5 });
    const stats = deriveStats(dino);
    const species = SPECIES['emberfang']!;
    expect(stats.hp).toBe(Math.round(species.baseStats.hp + species.growth.hp * 4));
    expect(stats.atk).toBe(Math.round(species.baseStats.atk + species.growth.atk * 4));
  });

  it('applies the quirk percent only to its own stat', () => {
    const dino = baseDino({ quirk: { stat: 'def', percent: 8 } });
    const stats = deriveStats(dino);
    const species = SPECIES['emberfang']!;
    expect(stats.def).toBe(Math.round(species.baseStats.def * 1.08));
    expect(stats.hp).toBe(species.baseStats.hp);
    expect(stats.atk).toBe(species.baseStats.atk);
  });

  it('applies a statPercent trait', () => {
    const dino = baseDino({ trait: 'brawny' }); // +10% ATK
    const stats = deriveStats(dino);
    const species = SPECIES['emberfang']!;
    expect(stats.atk).toBe(Math.round(species.baseStats.atk * 1.1));
  });

  it('applies gear statFlat before statPercent, on the same stat', () => {
    const item: ItemInstance = {
      uid: 'i1',
      slot: 'plating',
      rarity: 'uncommon',
      ilvl: 1,
      name: 'Test Plating',
      affixes: [
        { affix: 'of_iron_scales', value: 3 }, // statFlat def +3
        { affix: 'of_the_bastion', value: 5 }, // statPercent def +5%
      ],
    };
    const dino = baseDino({ gear: { plating: item } });
    const stats = deriveStats(dino);
    const species = SPECIES['emberfang']!;
    const expectedDef = Math.round((species.baseStats.def + 3) * 1.05);
    expect(stats.def).toBe(expectedDef);
  });

  it('applies the stage bonus (adult +10%, alpha +25%) uniformly to all stats', () => {
    const adult = deriveStats(baseDino({ level: 10 }));
    const alpha = deriveStats(baseDino({ level: 20 }));
    const species = SPECIES['emberfang']!;
    const rawAtLevel = (level: number) => ({
      hp: species.baseStats.hp + species.growth.hp * (level - 1),
      atk: species.baseStats.atk + species.growth.atk * (level - 1),
      def: species.baseStats.def + species.growth.def * (level - 1),
      spd: species.baseStats.spd + species.growth.spd * (level - 1),
    });
    const raw10 = rawAtLevel(10);
    const raw20 = rawAtLevel(20);
    expect(adult.hp).toBe(Math.round(raw10.hp * 1.1));
    expect(alpha.hp).toBe(Math.round(raw20.hp * 1.25));
  });

  it('never returns a stat below 1', () => {
    const stats = deriveStats(baseDino({ quirk: { stat: 'atk', percent: -95 } }));
    expect(stats.atk).toBeGreaterThanOrEqual(1);
  });
});

describe('deriveEnemyStats', () => {
  it('tier 1 (multiplier 1.0) matches raw base + growth exactly', () => {
    const species = SPECIES['cragmaul']!;
    const stats = deriveEnemyStats(species, 5, 1);
    expect(stats.hp).toBe(Math.round(species.baseStats.hp + species.growth.hp * 4));
  });

  it('higher tiers scale stats up', () => {
    const species = SPECIES['cragmaul']!;
    const t1 = deriveEnemyStats(species, 5, 1);
    const t4 = deriveEnemyStats(species, 5, 4);
    expect(t4.atk).toBeGreaterThan(t1.atk);
  });
});

describe('computeBonds', () => {
  it('detects an Aspect Bond when 2+ share an aspect', () => {
    const pack: PackMember[] = [
      { species: 'a', role: 'bruiser', aspect: 'ember' },
      { species: 'b', role: 'guardian', aspect: 'ember' },
    ];
    const bonds = computeBonds(pack);
    expect(bonds.some((b) => b.kind === 'aspect' && b.label === 'Ember Bond')).toBe(true);
    expect(bonds.some((b) => b.kind === 'role')).toBe(false);
    expect(bonds.some((b) => b.kind === 'balanced')).toBe(false);
  });

  it('detects a Role Bond when 2+ share a role', () => {
    const pack: PackMember[] = [
      { species: 'a', role: 'guardian', aspect: 'ember' },
      { species: 'b', role: 'guardian', aspect: 'frost' },
    ];
    const bonds = computeBonds(pack);
    expect(bonds.some((b) => b.kind === 'role' && b.label === 'Guardian Bond')).toBe(true);
    expect(bonds.some((b) => b.kind === 'aspect')).toBe(false);
  });

  it('detects Balanced Pack only for exactly 3 distinct roles among 3 dinos', () => {
    const pack: PackMember[] = [
      { species: 'a', role: 'bruiser', aspect: 'ember' },
      { species: 'b', role: 'guardian', aspect: 'frost' },
      { species: 'c', role: 'warden', aspect: 'verdant' },
    ];
    const bonds = computeBonds(pack);
    expect(bonds.some((b) => b.kind === 'balanced')).toBe(true);
    expect(bonds.some((b) => b.kind === 'aspect')).toBe(false);
    expect(bonds.some((b) => b.kind === 'role')).toBe(false);
  });

  it('does not grant Balanced Pack when roles repeat', () => {
    const pack: PackMember[] = [
      { species: 'a', role: 'bruiser', aspect: 'ember' },
      { species: 'b', role: 'bruiser', aspect: 'frost' },
      { species: 'c', role: 'warden', aspect: 'verdant' },
    ];
    const bonds = computeBonds(pack);
    expect(bonds.some((b) => b.kind === 'balanced')).toBe(false);
    expect(bonds.some((b) => b.kind === 'role' && b.label === 'Bruiser Bond')).toBe(true);
  });
});

describe('bondEffectsForPack', () => {
  it('Guardian bond reduces damage taken', () => {
    const effects = bondEffectsForPack([
      { role: 'guardian', aspect: 'ember' },
      { role: 'guardian', aspect: 'frost' },
    ]);
    expect(effects.damageTakenPercent).toBe(-10);
  });

  it('Stalker bond raises crit chance', () => {
    const effects = bondEffectsForPack([
      { role: 'stalker', aspect: 'ember' },
      { role: 'stalker', aspect: 'frost' },
    ]);
    expect(effects.critChancePercent).toBe(10);
  });

  it('Warden bond raises heal power', () => {
    const effects = bondEffectsForPack([
      { role: 'warden', aspect: 'ember' },
      { role: 'warden', aspect: 'frost' },
    ]);
    expect(effects.healPercent).toBe(15);
  });

  it('Screecher bond raises status chance and debuff magnitude', () => {
    const effects = bondEffectsForPack([
      { role: 'screecher', aspect: 'ember' },
      { role: 'screecher', aspect: 'frost' },
    ]);
    expect(effects.statusChanceBonus).toBeCloseTo(0.15);
    expect(effects.debuffMagnitudePercent).toBe(15);
  });

  it('Bruiser bond and Balanced Pack contribute stat boosts', () => {
    const bruiser = bondEffectsForPack([
      { role: 'bruiser', aspect: 'ember' },
      { role: 'bruiser', aspect: 'frost' },
    ]);
    expect(bruiser.statBoosts).toContainEqual({ stat: 'atk', percent: 10 });

    const balanced = bondEffectsForPack([
      { role: 'bruiser', aspect: 'ember' },
      { role: 'guardian', aspect: 'frost' },
      { role: 'warden', aspect: 'verdant' },
    ]);
    expect(balanced.statBoosts.filter((b) => b.percent === 5)).toHaveLength(4);
  });
});
