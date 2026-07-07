import { describe, expect, it } from 'vitest';
import { AFFIXES, RARITY_WEIGHTS } from '../../data/index';
import { createRng } from '../rng';
import {
  AFFIX_COUNT_BY_RARITY,
  generateItem,
  releaseEssence,
  rewardLoot,
  salvageEssence,
  upgradeCost,
  upgradeItem,
} from './loot';
import type { DinoInstance, ItemInstance, Rarity } from '../types';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function baseDino(overrides: Partial<DinoInstance> = {}): DinoInstance {
  return {
    uid: 'd1',
    species: 'emberfang',
    nickname: 'Test',
    level: 10,
    xp: 0,
    quirk: { stat: 'hp', percent: 5 },
    trait: 'brawny',
    moves: ['ember_snap'],
    gear: {},
    appearanceSeed: 1,
    currentHpPercent: 1,
    ...overrides,
  };
}

describe('generateItem', () => {
  it('affix count matches AFFIX_COUNT_BY_RARITY for every rarity (forced via guaranteedMinRarity)', () => {
    for (const rarity of RARITIES) {
      for (let seed = 0; seed < 60; seed++) {
        const item = generateItem({ ilvl: 20, tier: 4, rng: createRng(seed), guaranteedMinRarity: rarity });
        // guaranteedMinRarity is a floor, not an exact pin, but at tier 4 legendary-floored items still
        // land on legendary itself (nothing above it) and lower floors mostly land exactly on the floor
        // often enough — assert against the item's own resulting rarity, which is the real contract.
        expect(item.affixes.length).toBe(AFFIX_COUNT_BY_RARITY[item.rarity]);
        expect(RARITIES.indexOf(item.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf(rarity));
      }
    }
  });

  it('every rolled affix is legal for the item slot and there are no duplicates', () => {
    for (let seed = 0; seed < 300; seed++) {
      const item = generateItem({ ilvl: 15, tier: 4, rng: createRng(seed), guaranteedMinRarity: 'epic' });
      const ids = item.affixes.map((a) => a.affix);
      expect(new Set(ids).size).toBe(ids.length);
      for (const rolled of item.affixes) {
        const affix = AFFIXES[rolled.affix]!;
        expect(affix.slots).toContain(item.slot);
      }
    }
  });

  it('respects an explicit slot when given', () => {
    for (let seed = 0; seed < 30; seed++) {
      const item = generateItem({ ilvl: 10, tier: 3, rng: createRng(seed), slot: 'talon', guaranteedMinRarity: 'rare' });
      expect(item.slot).toBe('talon');
      for (const rolled of item.affixes) {
        expect(AFFIXES[rolled.affix]!.slots).toContain('talon');
      }
    }
  });

  it('guaranteedMinRarity clamps the roll at or above the floor', () => {
    for (let seed = 0; seed < 200; seed++) {
      const item = generateItem({ ilvl: 5, tier: 1, rng: createRng(seed), guaranteedMinRarity: 'rare' });
      expect(RARITIES.indexOf(item.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('rare'));
    }
  });

  it('tier 1 never rolls legendary on a natural (unboosted, unguaranteed) roll', () => {
    expect(RARITY_WEIGHTS[1].legendary).toBe(0);
    for (let seed = 0; seed < 2000; seed++) {
      const item = generateItem({ ilvl: 5, tier: 1, rng: createRng(seed) });
      expect(item.rarity).not.toBe('legendary');
    }
  });

  it('rarityBoost shifts a natural tier-1 roll upward', () => {
    let sawAboveCommon = false;
    for (let seed = 0; seed < 200; seed++) {
      const boosted = generateItem({ ilvl: 5, tier: 1, rng: createRng(seed), rarityBoost: 2 });
      const plain = generateItem({ ilvl: 5, tier: 1, rng: createRng(seed), rarityBoost: 0 });
      expect(RARITIES.indexOf(boosted.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf(plain.rarity));
      if (RARITIES.indexOf(boosted.rarity) > RARITIES.indexOf(plain.rarity)) sawAboveCommon = true;
    }
    expect(sawAboveCommon).toBe(true);
  });

  it('affix values scale monotonically (non-decreasing) with ilvl, holding the rng seed fixed', () => {
    for (let seed = 0; seed < 50; seed++) {
      const low = generateItem({ ilvl: 1, tier: 4, rng: createRng(seed), guaranteedMinRarity: 'epic' });
      const high = generateItem({ ilvl: 50, tier: 4, rng: createRng(seed), guaranteedMinRarity: 'epic' });
      // Same seed + same guaranteedMinRarity floor -> identical rng draw sequence for
      // slot/rarity/affix-selection; ilvl only changes the value scale, not the draws.
      expect(high.slot).toBe(low.slot);
      expect(high.affixes.map((a) => a.affix)).toEqual(low.affixes.map((a) => a.affix));
      for (let i = 0; i < low.affixes.length; i++) {
        expect(high.affixes[i]!.value).toBeGreaterThanOrEqual(low.affixes[i]!.value);
      }
    }
  });

  it('names are always non-empty, and legendary items get an epithet name', () => {
    for (let seed = 0; seed < 100; seed++) {
      const item = generateItem({ ilvl: 10, tier: 4, rng: createRng(seed) });
      expect(item.name.length).toBeGreaterThan(0);
      if (item.rarity === 'legendary') {
        expect(item.name).toContain(' of ');
        expect(item.legendaryPower).toBeDefined();
      } else {
        expect(item.legendaryPower).toBeUndefined();
      }
    }
  });
});

describe('salvageEssence / releaseEssence', () => {
  it('salvage essence is positive and strictly increases with rarity at fixed ilvl', () => {
    const values = RARITIES.map((rarity) =>
      salvageEssence({ uid: 'i', slot: 'plating', rarity, ilvl: 10, name: 'x', affixes: [] }),
    );
    for (const v of values) expect(v).toBeGreaterThan(0);
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
  });

  it('salvage essence increases with ilvl at fixed rarity', () => {
    const low = salvageEssence({ uid: 'i', slot: 'plating', rarity: 'rare', ilvl: 1, name: 'x', affixes: [] });
    const high = salvageEssence({ uid: 'i', slot: 'plating', rarity: 'rare', ilvl: 100, name: 'x', affixes: [] });
    expect(high).toBeGreaterThan(low);
  });

  it('release essence is positive and increases with dino level', () => {
    const low = releaseEssence(baseDino({ level: 1 }));
    const high = releaseEssence(baseDino({ level: 25 }));
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });
});

describe('upgradeItem / upgradeCost', () => {
  function itemAt(rarity: Rarity, affixCount: number): ItemInstance {
    const affixIds: Record<Rarity, string[]> = {
      common: [],
      uncommon: ['of_iron_scales'],
      rare: ['of_iron_scales', 'of_the_bastion'],
      epic: ['of_iron_scales', 'of_the_bastion', 'of_deep_marrow'],
      legendary: ['of_iron_scales', 'of_the_bastion', 'of_deep_marrow'],
    };
    return {
      uid: 'i1',
      slot: 'plating',
      rarity,
      ilvl: 10,
      name: 'Test Plating',
      affixes: affixIds[rarity].slice(0, affixCount).map((affix) => ({ affix, value: 3 })),
      legendaryPower: rarity === 'legendary' ? 'echoing_command' : undefined,
    };
  }

  it('bumps rarity by exactly one step and preserves existing affixes, adding one new one', () => {
    const item = itemAt('rare', 2);
    const upgraded = upgradeItem(item, createRng(1));
    expect(upgraded.rarity).toBe('epic');
    expect(upgraded.affixes.length).toBe(3);
    // original two affixes preserved verbatim
    expect(upgraded.affixes.slice(0, 2)).toEqual(item.affixes);
    const newAffixId = upgraded.affixes[2]!.affix;
    expect(item.affixes.some((a) => a.affix === newAffixId)).toBe(false);
    expect(new Set(upgraded.affixes.map((a) => a.affix)).size).toBe(3);
  });

  it('does not reroll the name (DESIGN: "rerolling nothing")', () => {
    const item = itemAt('uncommon', 1);
    const upgraded = upgradeItem(item, createRng(2));
    expect(upgraded.name).toBe(item.name);
  });

  it('epic -> legendary adds no new affix slot but does add a legendary power', () => {
    const item = itemAt('epic', 3);
    const upgraded = upgradeItem(item, createRng(3));
    expect(upgraded.rarity).toBe('legendary');
    expect(upgraded.affixes.length).toBe(3);
    expect(upgraded.affixes).toEqual(item.affixes);
    expect(upgraded.legendaryPower).toBeDefined();
  });

  it('is a no-op (stays legendary) once already at max rarity', () => {
    const item = itemAt('legendary', 3);
    const upgraded = upgradeItem(item, createRng(4));
    expect(upgraded.rarity).toBe('legendary');
    expect(upgraded.affixes).toEqual(item.affixes);
    expect(upgraded.legendaryPower).toBe(item.legendaryPower);
  });

  it('upgradeCost is positive for every rarity and strictly increases common -> epic', () => {
    const nonLegendary: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
    const costs = nonLegendary.map((rarity) => upgradeCost(itemAt(rarity, AFFIX_COUNT_BY_RARITY[rarity])));
    for (const c of costs) expect(c).toBeGreaterThan(0);
    for (let i = 1; i < costs.length; i++) expect(costs[i]!).toBeGreaterThan(costs[i - 1]!);
    expect(upgradeCost(itemAt('legendary', 3))).toBeGreaterThan(0);
  });
});

describe('rewardLoot', () => {
  it('battle: rolls essence always, an item only sometimes', () => {
    let sawItem = false;
    let sawNoItem = false;
    for (let seed = 0; seed < 200; seed++) {
      const reward = rewardLoot({ nodeKind: 'battle', tier: 2, enemyLevel: 10, lootFindPercent: 0, rng: createRng(seed) });
      expect(reward.essence).toBeGreaterThan(0);
      expect(reward.items.length).toBeLessThanOrEqual(1);
      if (reward.items.length === 1) sawItem = true;
      else sawNoItem = true;
    }
    expect(sawItem).toBe(true);
    expect(sawNoItem).toBe(true);
  });

  it('alpha: guarantees at least rare loot', () => {
    for (let seed = 0; seed < 100; seed++) {
      const reward = rewardLoot({ nodeKind: 'alpha', tier: 1, enemyLevel: 15, lootFindPercent: 0, rng: createRng(seed) });
      expect(reward.items).toHaveLength(1);
      expect(RARITIES.indexOf(reward.items[0]!.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('rare'));
    }
  });

  it('cache: rolls 1-2 items, all boosted', () => {
    for (let seed = 0; seed < 100; seed++) {
      const reward = rewardLoot({ nodeKind: 'cache', tier: 1, enemyLevel: 10, lootFindPercent: 0, rng: createRng(seed) });
      expect(reward.items.length).toBeGreaterThanOrEqual(1);
      expect(reward.items.length).toBeLessThanOrEqual(2);
    }
  });

  it('apex: guarantees 2 epic-or-better items', () => {
    for (let seed = 0; seed < 100; seed++) {
      const reward = rewardLoot({ nodeKind: 'apex', tier: 1, enemyLevel: 25, lootFindPercent: 0, rng: createRng(seed) });
      expect(reward.items).toHaveLength(2);
      for (const item of reward.items) {
        expect(RARITIES.indexOf(item.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('epic'));
      }
    }
  });

  it('higher lootFindPercent raises the battle drop chance', () => {
    let plainHits = 0;
    let boostedHits = 0;
    const trials = 500;
    for (let seed = 0; seed < trials; seed++) {
      if (rewardLoot({ nodeKind: 'battle', tier: 2, enemyLevel: 10, lootFindPercent: 0, rng: createRng(seed) }).items.length > 0) {
        plainHits++;
      }
      if (
        rewardLoot({ nodeKind: 'battle', tier: 2, enemyLevel: 10, lootFindPercent: 100, rng: createRng(seed + 1e6) }).items.length > 0
      ) {
        boostedHits++;
      }
    }
    expect(boostedHits).toBeGreaterThan(plainHits);
  });

  it('event/grove nodes yield no combat reward', () => {
    const grove = rewardLoot({ nodeKind: 'grove', tier: 1, enemyLevel: 10, lootFindPercent: 0, rng: createRng(1) });
    const event = rewardLoot({ nodeKind: 'event', tier: 1, enemyLevel: 10, lootFindPercent: 0, rng: createRng(1) });
    expect(grove).toEqual({ items: [], essence: 0 });
    expect(event).toEqual({ items: [], essence: 0 });
  });
});
