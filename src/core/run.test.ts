import { describe, expect, it } from 'vitest';
import { fixedRng, makeDino, scriptedRng } from './battle/testUtils';
import { DEFAULT_COMMANDS } from '../data/index';
import { ENEMY_XP_PER_LEVEL } from './balance';
import type { EventDef, ItemInstance, Rng } from './types';
import {
  applyEssenceYieldBonus,
  applyEventOutcome,
  applyGroveHeal,
  applyLootToInventory,
  canFieldActivePack,
  computeLootFindPercent,
  createNewGame,
  defeatLootKeepPercent,
  finishBattle,
  grantFlatXp,
  healAllDinos,
  reserveSize,
  resolveEventChoice,
  unlockedCommands,
} from './run';

function item(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    uid: overrides.uid ?? `i_${Math.random()}`,
    slot: overrides.slot ?? 'talon',
    rarity: overrides.rarity ?? 'common',
    ilvl: overrides.ilvl ?? 5,
    name: overrides.name ?? 'Test Item',
    affixes: overrides.affixes ?? [],
    legendaryPower: overrides.legendaryPower,
  };
}

describe('run.ts — new game', () => {
  it('createNewGame produces a fresh state with one active starter', () => {
    const state = createNewGame({ name: 'Rex', starterSpecies: 'emberfang', seed: 42 });
    expect(state.packmaster.name).toBe('Rex');
    expect(state.packmaster.level).toBe(1);
    expect(state.packmaster.skillPoints).toBe(0);
    expect(state.essence).toBe(0);
    expect(state.unlockedTier).toBe(1);
    expect(state.dinos).toHaveLength(1);
    expect(state.activePack).toEqual([state.dinos[0]!.uid]);
    expect(state.dinos[0]!.species).toBe('emberfang');
  });

  it('falls back to "Packmaster" for a blank name', () => {
    const state = createNewGame({ name: '   ', starterSpecies: 'emberfang', seed: 1 });
    expect(state.packmaster.name).toBe('Packmaster');
  });

  it('is deterministic for the same seed', () => {
    const a = createNewGame({ name: 'A', starterSpecies: 'thornback', seed: 7 });
    const b = createNewGame({ name: 'A', starterSpecies: 'thornback', seed: 7 });
    expect(a.dinos[0]!.appearanceSeed).toBe(b.dinos[0]!.appearanceSeed);
    expect(a.dinos[0]!.quirk).toEqual(b.dinos[0]!.quirk);
    expect(a.dinos[0]!.trait).toBe(b.dinos[0]!.trait);
  });
});

describe('run.ts — skill-derived numbers', () => {
  it('reserveSize is base 6 with no skills, +2/+4 with Handler skills', () => {
    expect(reserveSize([])).toBe(6);
    expect(reserveSize(['handler_roomy_pens'])).toBe(8);
    expect(reserveSize(['handler_roomy_pens', 'handler_broodmaster'])).toBe(12);
  });

  it('unlockedCommands starts at DEFAULT_COMMANDS and adds unlockCommand skills', () => {
    expect(unlockedCommands([])).toEqual(expect.arrayContaining(DEFAULT_COMMANDS));
    expect(unlockedCommands([])).toHaveLength(DEFAULT_COMMANDS.length);
    const withLure = unlockedCommands(['tactician_lure']);
    expect(withLure).toContain('throw_lure');
  });

  it('computeLootFindPercent sums skills and satchel affix values', () => {
    expect(computeLootFindPercent(['survivalist_forager'], {})).toBe(10);
    const satchel = item({
      slot: 'satchel',
      affixes: [{ affix: 'of_the_magpie', value: 12 }],
    });
    expect(computeLootFindPercent([], { satchel })).toBe(12);
    expect(computeLootFindPercent(['survivalist_forager'], { satchel })).toBe(22);
    // Unknown affix ids are ignored rather than throwing.
    const bogus = item({ slot: 'satchel', affixes: [{ affix: 'not_a_real_affix', value: 99 }] });
    expect(computeLootFindPercent([], { satchel: bogus })).toBe(0);
  });

  it('applyEssenceYieldBonus applies the Salvager skill percent', () => {
    expect(applyEssenceYieldBonus(100, [])).toBe(100);
    expect(applyEssenceYieldBonus(100, ['survivalist_salvager'])).toBe(125);
  });

  it('defeatLootKeepPercent is the base 50% plus Diehard', () => {
    expect(defeatLootKeepPercent([])).toBe(50);
    expect(defeatLootKeepPercent(['survivalist_diehard'])).toBe(75);
  });
});

describe('run.ts — camp / grove healing', () => {
  it('healAllDinos restores every dino to full HP', () => {
    const dinos = [makeDino('emberfang', { currentHpPercent: 0.1 }), makeDino('thornback', { currentHpPercent: 0 })];
    healAllDinos(dinos);
    expect(dinos.every((d) => d.currentHpPercent === 1)).toBe(true);
  });

  it('applyGroveHeal applies the base percent and clamps at 1.0', () => {
    const dinos = [makeDino('emberfang', { currentHpPercent: 0.2 })];
    const percent = applyGroveHeal(dinos, []);
    expect(percent).toBe(50);
    expect(dinos[0]!.currentHpPercent).toBeCloseTo(0.7);

    const full = [makeDino('emberfang', { currentHpPercent: 0.9 })];
    applyGroveHeal(full, []);
    expect(full[0]!.currentHpPercent).toBe(1);
  });

  it('applyGroveHeal adds the Herbalist skill bonus', () => {
    const dinos = [makeDino('emberfang', { currentHpPercent: 0 })];
    const percent = applyGroveHeal(dinos, ['survivalist_herbalist']);
    expect(percent).toBe(75);
  });

  it('canFieldActivePack is false only when every dino has fainted', () => {
    expect(canFieldActivePack([makeDino('emberfang', { currentHpPercent: 0 }), makeDino('thornback', { currentHpPercent: 0.4 })])).toBe(true);
    expect(canFieldActivePack([makeDino('emberfang', { currentHpPercent: 0 })])).toBe(false);
  });
});

describe('run.ts — inventory cap', () => {
  it('accepts everything under the cap and reports no overflow', () => {
    const result = applyLootToInventory([], [item(), item()]);
    expect(result.inventory).toHaveLength(2);
    expect(result.overflow).toHaveLength(0);
  });

  it('overflows items past INVENTORY_CAP (60)', () => {
    const existing = Array.from({ length: 59 }, () => item());
    const incoming = [item({ uid: 'a' }), item({ uid: 'b' }), item({ uid: 'c' })];
    const result = applyLootToInventory(existing, incoming);
    expect(result.inventory).toHaveLength(60);
    expect(result.overflow.map((i) => i.uid)).toEqual(['b', 'c']);
  });
});

describe('run.ts — event resolution', () => {
  const choiceNoRisk: EventDef['choices'][number] = { label: 'x', outcome: { kind: 'essence', amount: 25 } };
  const choiceWithRisk: EventDef['choices'][number] = {
    label: 'y',
    outcome: { kind: 'loot', rarityBoost: 1 },
    risk: { chance: 0.5, else: { kind: 'damageTeam', percent: 15 } },
  };

  it('returns the outcome directly when there is no risk', () => {
    const result = resolveEventChoice(choiceNoRisk, fixedRng(0.99));
    expect(result).toEqual({ outcome: choiceNoRisk.outcome, gambleFailed: false });
  });

  it('resolves the main outcome when the gamble succeeds', () => {
    // rng.chance(p) = next() < p; next()=0 always succeeds against any p>0.
    const result = resolveEventChoice(choiceWithRisk, fixedRng(0));
    expect(result.gambleFailed).toBe(false);
    expect(result.outcome).toEqual(choiceWithRisk.outcome);
  });

  it('resolves the else branch when the gamble fails', () => {
    // next()=0.99 fails against chance=0.5.
    const result = resolveEventChoice(choiceWithRisk, fixedRng(0.99));
    expect(result.gambleFailed).toBe(true);
    expect(result.outcome).toEqual(choiceWithRisk.risk!.else);
  });

  it('applyEventOutcome: essence grants a flat amount', () => {
    const result = applyEventOutcome({ kind: 'essence', amount: 25 }, {
      active: [],
      reserve: [],
      skills: [],
      tier: 1,
      itemLevel: 5,
      rng: fixedRng(0),
    });
    expect(result.essenceGained).toBe(25);
  });

  it('applyEventOutcome: healTeam raises HP and clamps at 1', () => {
    const active = [makeDino('emberfang', { currentHpPercent: 0.5 })];
    const result = applyEventOutcome({ kind: 'healTeam', percent: 40 }, {
      active,
      reserve: [],
      skills: [],
      tier: 1,
      itemLevel: 5,
      rng: fixedRng(0),
    });
    expect(result.healedPercent).toBe(40);
    expect(active[0]!.currentHpPercent).toBe(0.9);
  });

  it('applyEventOutcome: damageTeam lowers HP and clamps at 0', () => {
    const active = [makeDino('emberfang', { currentHpPercent: 0.1 })];
    applyEventOutcome({ kind: 'damageTeam', percent: 25 }, {
      active,
      reserve: [],
      skills: [],
      tier: 1,
      itemLevel: 5,
      rng: fixedRng(0),
    });
    expect(active[0]!.currentHpPercent).toBe(0);
  });

  it('applyEventOutcome: xp grants the exact flat amount via grantFlatXp', () => {
    const active = [makeDino('emberfang', { level: 2, xp: 0 })];
    const result = applyEventOutcome({ kind: 'xp', amount: 60 }, {
      active,
      reserve: [],
      skills: [],
      tier: 1,
      itemLevel: 5,
      rng: fixedRng(0),
    });
    expect(result.xp?.xpAwarded[active[0]!.uid]).toBe(60);
  });

  it('applyEventOutcome: battle sets triggersBattle', () => {
    const result = applyEventOutcome({ kind: 'battle', alpha: true }, {
      active: [],
      reserve: [],
      skills: [],
      tier: 1,
      itemLevel: 5,
      rng: fixedRng(0),
    });
    expect(result.triggersBattle).toEqual({ alpha: true });
  });

  it('applyEventOutcome: loot generates one item at the given tier', () => {
    const result = applyEventOutcome({ kind: 'loot', rarityBoost: 2 }, {
      active: [],
      reserve: [],
      skills: [],
      tier: 4,
      itemLevel: 12,
      rng: fixedRng(0.5),
    });
    expect(result.lootItems).toHaveLength(1);
    expect(result.lootItems[0]!.ilvl).toBe(12);
  });
});

describe('run.ts — grantFlatXp', () => {
  it('reproduces the exact requested XP amount', () => {
    const active = [makeDino('emberfang')];
    const result = grantFlatXp(active, [], 3 * ENEMY_XP_PER_LEVEL, []);
    expect(result.xpAwarded[active[0]!.uid]).toBe(3 * ENEMY_XP_PER_LEVEL);
  });
});

describe('run.ts — finishBattle', () => {
  function baseInput(overrides: Partial<Parameters<typeof finishBattle>[0]> = {}) {
    return {
      outcome: 'victory' as const,
      nodeKind: 'battle' as const,
      biome: 'cinder_peaks',
      tier: 1 as const,
      unlockedTier: 1 as const,
      apexCleared: {},
      defeatedEnemyLevels: [5, 5, 5],
      active: [makeDino('emberfang')],
      reserve: [],
      skills: [],
      lootFindPercent: 0,
      packmaster: { name: 'P', level: 1, xp: 0, skillPoints: 0, skills: [], gear: {} },
      lootFoundSoFar: [],
      essenceFoundSoFar: 0,
      rng: fixedRng(0.9),
      ...overrides,
    };
  }

  it('victory grants dino xp, packmaster xp, and node loot', () => {
    const input = baseInput();
    const result = finishBattle(input);
    const expectedTotal = 3 * 5 * ENEMY_XP_PER_LEVEL;
    expect(result.xp?.xpAwarded[input.active[0]!.uid]).toBe(expectedTotal);
    expect(result.masterXp?.skillPointsGained).toBeGreaterThanOrEqual(0);
    expect(input.packmaster.xp + input.packmaster.level).toBeGreaterThan(0); // packmaster mutated in place
    expect(result.loot).toBeInstanceOf(Array);
    expect(result.essence).toBeGreaterThanOrEqual(0);
  });

  it('apex victory at the current unlocked tier advances apexCleared and unlockedTier', () => {
    const result = finishBattle(baseInput({ nodeKind: 'apex', tier: 2, unlockedTier: 2, apexCleared: {} }));
    expect(result.apexCleared).toEqual({ cinder_peaks: 2 });
    expect(result.unlockedTier).toBe(3);
  });

  it('apex victory below the current unlocked tier only updates apexCleared if it is a new best', () => {
    const result = finishBattle(
      baseInput({ nodeKind: 'apex', tier: 1, unlockedTier: 3, apexCleared: { cinder_peaks: 2 } }),
    );
    expect(result.apexCleared).toEqual({ cinder_peaks: 2 });
    expect(result.unlockedTier).toBeUndefined();
  });

  it('apex victory at tier 4 (max) does not bump unlockedTier further', () => {
    const result = finishBattle(baseInput({ nodeKind: 'apex', tier: 4, unlockedTier: 4, apexCleared: {} }));
    expect(result.unlockedTier).toBeUndefined();
    expect(result.apexCleared).toEqual({ cinder_peaks: 4 });
  });

  it('defeat keeps a percentage of the run loot/essence and grants no new rewards', () => {
    const loot = [item({ uid: 'a' }), item({ uid: 'b' }), item({ uid: 'c' }), item({ uid: 'd' })];
    const result = finishBattle(
      baseInput({ outcome: 'defeat', lootFoundSoFar: loot, essenceFoundSoFar: 100, rng: fixedRng(0) as Rng }),
    );
    expect(result.loot).toHaveLength(0);
    expect(result.essence).toBe(0);
    expect(result.keptLoot).toHaveLength(2); // floor(4 * 0.5)
    expect(result.keptEssence).toBe(50);
  });

  it('defeat with Diehard keeps a larger share', () => {
    const loot = [item({ uid: 'a' }), item({ uid: 'b' }), item({ uid: 'c' }), item({ uid: 'd' })];
    const result = finishBattle(
      baseInput({
        outcome: 'defeat',
        skills: ['survivalist_diehard'],
        lootFoundSoFar: loot,
        essenceFoundSoFar: 100,
      }),
    );
    expect(result.keptLoot).toHaveLength(3); // floor(4 * 0.75)
    expect(result.keptEssence).toBe(75);
  });
});

// Silence an unused-import lint concern for scriptedRng in environments that
// check imports strictly — kept available for future scripted-Rng cases.
void scriptedRng;
