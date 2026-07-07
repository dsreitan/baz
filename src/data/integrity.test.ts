/**
 * Referential-integrity suite for the content tables. Every cross-table id
 * reference must resolve, ids must be unique, and structural content rules
 * from DESIGN/IMPLEMENTATION_PLAN must hold.
 */
import { describe, expect, it } from 'vitest';
import { ASPECT_WHEEL, type GearSlot, type Rarity, type StatusId, type WorldTier } from '../core/types';
import {
  AFFIX_LIST,
  ALPHA_MOD_LIST,
  BASE_NAMES,
  BIOME_LIST,
  COMMAND_LIST,
  COMMANDS,
  DEFAULT_COMMANDS,
  EVENT_LIST,
  MOVE_LIST,
  MOVES,
  RARITY_WEIGHTS,
  SKILL_LIST,
  SPECIES,
  SPECIES_LIST,
  STARTER_SPECIES,
  TRAIT_LIST,
  TRAITS,
} from './index';

const COMBO_STATES: StatusId[] = ['soak', 'chill', 'knockdown', 'charged'];
const VALID_SLOTS: GearSlot[] = ['plating', 'talon', 'charm', 'whistle', 'satchel', 'standard'];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const TIERS: WorldTier[] = [1, 2, 3, 4];

function expectUniqueIds(label: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    expect(seen.has(id), `${label}: duplicate id "${id}"`).toBe(false);
    seen.add(id);
  }
}

describe('id uniqueness', () => {
  it('every table has unique ids', () => {
    expectUniqueIds('species', SPECIES_LIST.map((s) => s.id));
    expectUniqueIds('moves', MOVE_LIST.map((m) => m.id));
    expectUniqueIds('traits', TRAIT_LIST.map((t) => t.id));
    expectUniqueIds('affixes', AFFIX_LIST.map((a) => a.id));
    expectUniqueIds('skills', SKILL_LIST.map((s) => s.id));
    expectUniqueIds('commands', COMMAND_LIST.map((c) => c.id));
    expectUniqueIds('biomes', BIOME_LIST.map((b) => b.id));
    expectUniqueIds('events', EVENT_LIST.map((e) => e.id));
    expectUniqueIds('alpha mods', ALPHA_MOD_LIST.map((a) => a.id));
  });
});

describe('species', () => {
  it('every learnset move exists in MOVES', () => {
    for (const species of SPECIES_LIST) {
      for (const entry of species.learnset) {
        expect(MOVES[entry.move], `${species.id}: unknown move "${entry.move}"`).toBeDefined();
      }
    }
  });

  it('every learnset starts at level 1 and is sorted by level', () => {
    for (const species of SPECIES_LIST) {
      expect(species.learnset.length, `${species.id}: empty learnset`).toBeGreaterThan(0);
      expect(species.learnset[0]!.level, `${species.id}: first move not at level 1`).toBe(1);
      for (let i = 1; i < species.learnset.length; i++) {
        expect(
          species.learnset[i]!.level,
          `${species.id}: learnset not sorted at index ${i}`,
        ).toBeGreaterThanOrEqual(species.learnset[i - 1]!.level);
      }
    }
  });

  it('every traitPool entry exists in TRAITS', () => {
    for (const species of SPECIES_LIST) {
      expect(species.traitPool.length, `${species.id}: empty traitPool`).toBeGreaterThan(0);
      for (const traitId of species.traitPool) {
        expect(TRAITS[traitId], `${species.id}: unknown trait "${traitId}"`).toBeDefined();
      }
    }
  });

  it('has 18 tameable species and 6 bosses', () => {
    const tameable = SPECIES_LIST.filter((s) => !s.isBoss);
    const bosses = SPECIES_LIST.filter((s) => s.isBoss);
    expect(tameable.length).toBe(18);
    expect(bosses.length).toBe(6);
  });

  it('tameable roster covers all aspects and all roles', () => {
    const tameable = SPECIES_LIST.filter((s) => !s.isBoss);
    for (const aspect of ASPECT_WHEEL) {
      expect(
        tameable.some((s) => s.aspect === aspect),
        `no tameable species with aspect "${aspect}"`,
      ).toBe(true);
    }
    for (const role of ['bruiser', 'guardian', 'stalker', 'warden', 'screecher'] as const) {
      expect(
        tameable.some((s) => s.role === role),
        `no tameable species with role "${role}"`,
      ).toBe(true);
    }
  });
});

describe('moves', () => {
  it('each aspect has at least one combo applier and one combo consumer', () => {
    for (const aspect of ASPECT_WHEEL) {
      const ofAspect = MOVE_LIST.filter((m) => m.aspect === aspect);
      const applier = ofAspect.some((m) =>
        m.effects.some(
          (fx) => fx.kind === 'applyStatus' && COMBO_STATES.includes(fx.status),
        ),
      );
      const consumer = ofAspect.some((m) => m.combo !== undefined);
      expect(applier, `aspect "${aspect}" has no combo applier`).toBe(true);
      expect(consumer, `aspect "${aspect}" has no combo consumer`).toBe(true);
    }
  });

  it('combo specs only consume combo states', () => {
    for (const move of MOVE_LIST) {
      if (move.combo) {
        expect(
          COMBO_STATES.includes(move.combo.consumes),
          `${move.id}: consumes non-combo status "${move.combo.consumes}"`,
        ).toBe(true);
      }
    }
  });

  it('accuracy and cooldown are within contract ranges', () => {
    for (const move of MOVE_LIST) {
      expect(move.accuracy, `${move.id}: accuracy out of range`).toBeGreaterThanOrEqual(0.85);
      expect(move.accuracy, `${move.id}: accuracy out of range`).toBeLessThanOrEqual(1);
      expect(move.cooldown, `${move.id}: cooldown out of range`).toBeGreaterThanOrEqual(0);
      expect(move.cooldown, `${move.id}: cooldown out of range`).toBeLessThanOrEqual(3);
    }
  });

  it('includes the canonical DESIGN combo examples', () => {
    // A Tide move applying soak.
    expect(
      MOVE_LIST.some(
        (m) =>
          m.aspect === 'tide' &&
          m.effects.some((fx) => fx.kind === 'applyStatus' && fx.status === 'soak'),
      ),
    ).toBe(true);
    // A Storm move consuming soak for +50% damage.
    expect(
      MOVE_LIST.some(
        (m) => m.aspect === 'storm' && m.combo?.consumes === 'soak' && m.combo.bonusDamage === 0.5,
      ),
    ).toBe(true);
    // A Frost move applying chill.
    expect(
      MOVE_LIST.some(
        (m) =>
          m.aspect === 'frost' &&
          m.effects.some((fx) => fx.kind === 'applyStatus' && fx.status === 'chill'),
      ),
    ).toBe(true);
    // A strike consuming chill for a guaranteed crit.
    expect(
      MOVE_LIST.some(
        (m) => m.category === 'strike' && m.combo?.consumes === 'chill' && m.combo.guaranteedCrit,
      ),
    ).toBe(true);
    // A move applying knockdown, and one consuming it with ignoreDef.
    expect(
      MOVE_LIST.some((m) =>
        m.effects.some((fx) => fx.kind === 'applyStatus' && fx.status === 'knockdown'),
      ),
    ).toBe(true);
    expect(
      MOVE_LIST.some((m) => m.combo?.consumes === 'knockdown' && m.combo.ignoreDef),
    ).toBe(true);
  });
});

describe('biomes', () => {
  it('speciesPool members exist and are not bosses; apex exists and is a boss', () => {
    for (const biome of BIOME_LIST) {
      for (const speciesId of biome.speciesPool) {
        const species = SPECIES[speciesId];
        expect(species, `${biome.id}: unknown species "${speciesId}"`).toBeDefined();
        expect(species!.isBoss, `${biome.id}: boss "${speciesId}" in wild pool`).toBeFalsy();
      }
      const apex = SPECIES[biome.apexSpecies];
      expect(apex, `${biome.id}: unknown apex "${biome.apexSpecies}"`).toBeDefined();
      expect(apex!.isBoss, `${biome.id}: apex "${biome.apexSpecies}" is not a boss`).toBe(true);
    }
  });

  it('each biome biases exactly 2 aspects and has 5-7 wild species', () => {
    for (const biome of BIOME_LIST) {
      expect(biome.aspectBias.length, `${biome.id}: aspectBias size`).toBe(2);
      expect(biome.speciesPool.length, `${biome.id}: pool size`).toBeGreaterThanOrEqual(5);
      expect(biome.speciesPool.length, `${biome.id}: pool size`).toBeLessThanOrEqual(7);
    }
  });

  it('every apex boss belongs to exactly one biome', () => {
    const apexes = BIOME_LIST.map((b) => b.apexSpecies);
    expectUniqueIds('apex species', apexes);
    expect(apexes.length).toBe(SPECIES_LIST.filter((s) => s.isBoss).length);
  });
});

describe('skills & commands', () => {
  it('every unlockCommand/commandBonus references a known command', () => {
    for (const skill of SKILL_LIST) {
      if (skill.effect.kind === 'unlockCommand' || skill.effect.kind === 'commandBonus') {
        expect(
          COMMANDS[skill.effect.command],
          `${skill.id}: unknown command "${skill.effect.command}"`,
        ).toBeDefined();
      }
    }
  });

  it('has 18 skills: 3 branches x 3 tiers x 2 nodes', () => {
    expect(SKILL_LIST.length).toBe(18);
    for (const branch of ['tactician', 'handler', 'survivalist'] as const) {
      for (const tier of [1, 2, 3]) {
        const nodes = SKILL_LIST.filter((s) => s.branch === branch && s.tier === tier);
        expect(nodes.length, `${branch} tier ${tier}`).toBe(2);
      }
    }
  });

  it('default commands exist and non-default commands are unlockable via tactician', () => {
    for (const commandId of DEFAULT_COMMANDS) {
      expect(COMMANDS[commandId], `unknown default command "${commandId}"`).toBeDefined();
    }
    const unlockable = new Set(
      SKILL_LIST.flatMap((s) => (s.effect.kind === 'unlockCommand' ? [s.effect.command] : [])),
    );
    for (const command of COMMAND_LIST) {
      if (!DEFAULT_COMMANDS.includes(command.id)) {
        expect(
          unlockable.has(command.id),
          `command "${command.id}" is neither default nor unlockable`,
        ).toBe(true);
      }
    }
  });
});

describe('affixes & items', () => {
  it('every affix lists at least one valid slot', () => {
    for (const affix of AFFIX_LIST) {
      expect(affix.slots.length, `${affix.id}: no slots`).toBeGreaterThan(0);
      for (const slot of affix.slots) {
        expect(VALID_SLOTS.includes(slot), `${affix.id}: invalid slot "${slot}"`).toBe(true);
      }
    }
  });

  it('every slot has at least one affix and base names', () => {
    for (const slot of VALID_SLOTS) {
      expect(
        AFFIX_LIST.some((a) => a.slots.includes(slot)),
        `no affixes for slot "${slot}"`,
      ).toBe(true);
      expect(BASE_NAMES[slot].length, `no base names for slot "${slot}"`).toBeGreaterThanOrEqual(4);
    }
  });

  it('affix roll ranges are sane (min <= max)', () => {
    for (const affix of AFFIX_LIST) {
      const fx = affix.effect;
      if ('min' in fx) {
        expect(fx.min, `${affix.id}: min > max`).toBeLessThanOrEqual(fx.max);
      } else {
        expect(fx.chanceMin, `${affix.id}: chanceMin > chanceMax`).toBeLessThanOrEqual(fx.chanceMax);
      }
    }
  });

  it('rarity weights are defined for all 4 tiers and all rarities', () => {
    for (const tier of TIERS) {
      const weights = RARITY_WEIGHTS[tier];
      expect(weights, `no weights for tier ${tier}`).toBeDefined();
      for (const rarity of RARITIES) {
        expect(typeof weights[rarity], `tier ${tier}: missing weight for "${rarity}"`).toBe('number');
      }
      const total = RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
      expect(total, `tier ${tier}: zero total weight`).toBeGreaterThan(0);
    }
    expect(RARITY_WEIGHTS[1].legendary, 'legendary must be impossible at tier 1').toBe(0);
  });
});

describe('starters', () => {
  it('STARTER_SPECIES exist, are not bosses, and have low tame difficulty', () => {
    expect(STARTER_SPECIES.length).toBe(3);
    for (const id of STARTER_SPECIES) {
      const species = SPECIES[id];
      expect(species, `unknown starter "${id}"`).toBeDefined();
      expect(species!.isBoss, `starter "${id}" is a boss`).toBeFalsy();
      expect(species!.tameDifficulty, `starter "${id}" too hard to tame`).toBeLessThanOrEqual(0.8);
    }
    const roles = new Set(STARTER_SPECIES.map((id) => SPECIES[id]!.role));
    expect(roles.has('bruiser')).toBe(true);
    expect(roles.has('guardian')).toBe(true);
    expect(roles.has('warden')).toBe(true);
  });
});

describe('events', () => {
  it('every event has 2-3 choices', () => {
    expect(EVENT_LIST.length).toBe(10);
    for (const event of EVENT_LIST) {
      expect(event.choices.length, `${event.id}: choice count`).toBeGreaterThanOrEqual(2);
      expect(event.choices.length, `${event.id}: choice count`).toBeLessThanOrEqual(3);
    }
  });

  it('several events carry risk gambles', () => {
    const risky = EVENT_LIST.filter((e) => e.choices.some((c) => c.risk !== undefined));
    expect(risky.length).toBeGreaterThanOrEqual(3);
  });
});

describe('purity', () => {
  it('all species references inside data resolve both directions (no orphan bosses)', () => {
    const pooled = new Set(BIOME_LIST.flatMap((b) => [...b.speciesPool, b.apexSpecies]));
    for (const species of SPECIES_LIST) {
      expect(pooled.has(species.id), `species "${species.id}" appears in no biome`).toBe(true);
    }
  });
});
