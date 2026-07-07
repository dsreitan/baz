/**
 * Shared test fixtures/doubles for battle-engine tests. Not a test suite
 * itself (no `describe`/`it`) — vitest's default include glob only picks up
 * `*.test.ts`/`*.spec.ts`, so this file is safe to import from those.
 */
import { SPECIES } from '../../data/index';
import type { Combatant, DinoInstance, MoveId, Rng, StatBlock, Uid } from '../types';
import type { CreateBattleConfig } from './engine';

let uidCounter = 0;
export function nextUid(prefix: string): Uid {
  uidCounter += 1;
  return `${prefix}_${uidCounter}`;
}

export function makeDino(species: string, overrides: Partial<DinoInstance> = {}): DinoInstance {
  const def = SPECIES[species];
  if (!def) throw new Error(`testUtils.makeDino: unknown species "${species}"`);
  const level = overrides.level ?? 5;
  const movesAtLevel = def.learnset.filter((e) => e.level <= level).map((e) => e.move);
  const moves = overrides.moves ?? movesAtLevel.slice(-4);
  return {
    uid: overrides.uid ?? nextUid(species),
    species,
    nickname: overrides.nickname ?? def.name,
    level,
    xp: overrides.xp ?? 0,
    quirk: overrides.quirk ?? { stat: 'hp', percent: 5 },
    trait: overrides.trait ?? (def.traitPool[0] as string),
    alphaTrait: overrides.alphaTrait,
    moves,
    gear: overrides.gear ?? {},
    appearanceSeed: overrides.appearanceSeed ?? 1,
    currentHpPercent: overrides.currentHpPercent ?? 1,
  };
}

export function makeWildCombatant(species: string, overrides: Partial<Combatant> = {}): Combatant {
  const def = SPECIES[species];
  if (!def) throw new Error(`testUtils.makeWildCombatant: unknown species "${species}"`);
  const level = overrides.level ?? 5;
  const stats: StatBlock = overrides.stats ?? {
    hp: Math.round(def.baseStats.hp + def.growth.hp * (level - 1)),
    atk: Math.round(def.baseStats.atk + def.growth.atk * (level - 1)),
    def: Math.round(def.baseStats.def + def.growth.def * (level - 1)),
    spd: Math.round(def.baseStats.spd + def.growth.spd * (level - 1)),
  };
  const movesAtLevel = def.learnset.filter((e) => e.level <= level).map((e) => e.move);
  const moves: MoveId[] = overrides.moves ?? movesAtLevel.slice(-4);
  const cooldowns = overrides.cooldowns ?? Object.fromEntries(moves.map((m) => [m, 0]));
  return {
    uid: overrides.uid ?? nextUid(species),
    side: 'enemy',
    species,
    nickname: overrides.nickname ?? def.name,
    level,
    stage: overrides.stage ?? 'juvenile',
    stats,
    currentHp: overrides.currentHp ?? stats.hp,
    shield: overrides.shield ?? 0,
    statuses: overrides.statuses ?? [],
    cooldowns,
    moves,
    trait: overrides.trait ?? (def.traitPool[0] as string),
    alphaMods: overrides.alphaMods ?? [],
    appearanceSeed: overrides.appearanceSeed ?? 1,
    tameable: overrides.tameable ?? !def.isBoss,
    fainted: overrides.fainted ?? false,
  };
}

export function basicConfig(overrides: Partial<CreateBattleConfig> = {}): CreateBattleConfig {
  return {
    kind: overrides.kind ?? 'wild',
    playerDinos: overrides.playerDinos ?? [makeDino('emberfang')],
    reserve: overrides.reserve ?? [],
    enemies: overrides.enemies ?? [makeWildCombatant('cragmaul')],
    commands: overrides.commands ?? ['rally', 'field_dressing'],
    skills: overrides.skills ?? [],
    masterGear: overrides.masterGear ?? {},
  };
}

/** An Rng double whose every `next()` call returns the same fixed value in [0,1). */
export function fixedRng(value: number): Rng {
  const clamped = Math.max(0, Math.min(0.999999999, value));
  const self: Rng = {
    next: () => clamped,
    int: (min, max) => min + Math.floor(clamped * (max - min + 1)),
    chance: (p) => clamped < p,
    pick: (arr) => {
      if (arr.length === 0) throw new Error('fixedRng.pick: empty array');
      return arr[Math.min(arr.length - 1, Math.floor(clamped * arr.length))] as (typeof arr)[number];
    },
    shuffle: (arr) => arr.slice(),
    fork: () => self,
  };
  return self;
}

/** An Rng double that replays a fixed script of `next()` values, looping once exhausted. */
export function scriptedRng(values: number[]): Rng {
  if (values.length === 0) throw new Error('scriptedRng: values must be non-empty');
  let i = 0;
  const next = (): number => {
    const v = values[i % values.length] as number;
    i += 1;
    return v;
  };
  const self: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => {
      if (arr.length === 0) throw new Error('scriptedRng.pick: empty array');
      return arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))] as (typeof arr)[number];
    },
    shuffle: (arr) => arr.slice(),
    fork: () => scriptedRng(values),
  };
  return self;
}
