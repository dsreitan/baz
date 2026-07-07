/**
 * Wild dino / combatant generation (DESIGN §2/§4/§7, ARCHITECTURE gen/dino.ts).
 *
 * `generateWildCombatant` builds a single enemy `Combatant`; `generateEncounter`
 * assembles a whole enemy group for a node (battle/alpha/apex), including the
 * `summonAdd` alpha-mod's extra wild ally (engine.ts's module doc explicitly
 * defers that to generation — see engine.ts's `aggregateAlphaMods` comment).
 * `generateTamedDino`/`generateStarter` convert generation output into the
 * `DinoInstance` shape owned dinos use.
 */
import { BIOMES, SPECIES, ALPHA_MODS } from '../../data/index';
import { ALPHA_STAT_MULTIPLIER, APEX_STAT_MULTIPLIER, DINO_MAX_LEVEL, ENEMY_LEVEL_OFFSET_BY_TIER } from '../balance';
import { deriveEnemyStats, stageForLevel } from '../stats';
import { apexMods, rollAlphaMods } from './alpha';
import type {
  AlphaModId,
  BiomeDef,
  BiomeId,
  Combatant,
  DinoInstance,
  MoveId,
  Rng,
  SpeciesDef,
  SpeciesId,
  StatBlock,
  StatKey,
  Uid,
  WorldTier,
} from '../types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const UID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Deterministic, Rng-sourced unique id (types.ts: "unique per instance, from rng"). */
function genUid(prefix: string, rng: Rng): Uid {
  let s = '';
  for (let i = 0; i < 10; i++) s += rng.pick(UID_ALPHABET.split(''));
  return `${prefix}_${s}`;
}

function requireBiome(biome: BiomeId): BiomeDef {
  const def = BIOMES[biome];
  if (!def) throw new Error(`gen/dino: unknown biome "${biome}"`);
  return def;
}

function requireSpecies(id: SpeciesId): SpeciesDef {
  const def = SPECIES[id];
  if (!def) throw new Error(`gen/dino: unknown species "${id}"`);
  return def;
}

/** Species learnset moves unlocked by `level`, capped to the last 4 (active slot limit). */
function movesAtLevel(species: SpeciesDef, level: number): MoveId[] {
  const learned = species.learnset.filter((entry) => entry.level <= level).map((entry) => entry.move);
  return learned.slice(-4);
}

function scaleStats(stats: StatBlock, mult: number): StatBlock {
  return {
    hp: Math.max(1, Math.round(stats.hp * mult)),
    atk: Math.max(1, Math.round(stats.atk * mult)),
    def: Math.max(1, Math.round(stats.def * mult)),
    spd: Math.max(1, Math.round(stats.spd * mult)),
  };
}

const QUIRK_STATS: StatKey[] = ['hp', 'atk', 'def', 'spd'];

/** DESIGN §4.4: each individual rolls a small random stat Quirk (+5-10% to one stat). */
function rollQuirk(rng: Rng): DinoInstance['quirk'] {
  return { stat: rng.pick(QUIRK_STATS), percent: rng.int(5, 10) };
}

/**
 * Weighted species pick from a biome's wild pool: species whose aspect is one
 * of the biome's two biased aspects are 3x as likely as the rest of the pool.
 */
export function pickWildSpecies(biomeDef: BiomeDef, rng: Rng): SpeciesId {
  const weighted: SpeciesId[] = [];
  for (const id of biomeDef.speciesPool) {
    const species = SPECIES[id];
    const weight = species && biomeDef.aspectBias.includes(species.aspect) ? 3 : 1;
    for (let i = 0; i < weight; i++) weighted.push(id);
  }
  return rng.pick(weighted);
}

// ---------------------------------------------------------------------------
// generateWildCombatant
// ---------------------------------------------------------------------------

export interface GenerateWildCombatantOpts {
  biome: BiomeId;
  tier: WorldTier;
  /** Reference level before jitter; generateEncounter derives this from pack avg level + tier offset. */
  targetLevel: number;
  rng: Rng;
  /** Wild Alpha: gets ALPHA_STAT_MULTIPLIER. Mods themselves are rolled by the caller (generateEncounter). */
  alpha?: boolean;
  /** Apex boss: uses the biome's apexSpecies and APEX_STAT_MULTIPLIER. Not tameable. */
  apex?: boolean;
}

/** Generate a single wild enemy `Combatant` for `biome`/`tier` (DESIGN §2/§4/§7). */
export function generateWildCombatant(opts: GenerateWildCombatantOpts): Combatant {
  const biomeDef = requireBiome(opts.biome);
  const speciesId = opts.apex ? biomeDef.apexSpecies : pickWildSpecies(biomeDef, opts.rng);
  const species = requireSpecies(speciesId);

  const jitter = opts.rng.int(-1, 1);
  const level = Math.max(1, Math.min(DINO_MAX_LEVEL, opts.targetLevel + jitter));

  let stats = deriveEnemyStats(species, level, opts.tier);
  if (opts.apex) stats = scaleStats(stats, APEX_STAT_MULTIPLIER);
  else if (opts.alpha) stats = scaleStats(stats, ALPHA_STAT_MULTIPLIER);

  const moves = movesAtLevel(species, level);
  const trait = opts.rng.pick(species.traitPool);
  const appearanceSeed = opts.rng.int(1, 0x7fffffff);

  return {
    uid: genUid(opts.apex ? 'apex' : opts.alpha ? 'alpha' : 'wild', opts.rng),
    side: 'enemy',
    species: speciesId,
    nickname: species.name,
    level,
    stage: stageForLevel(level),
    stats,
    currentHp: stats.hp,
    shield: 0,
    statuses: [],
    cooldowns: Object.fromEntries(moves.map((move) => [move, 0])),
    moves,
    trait,
    alphaMods: [],
    appearanceSeed,
    tameable: !opts.apex && !species.isBoss,
    fainted: false,
  };
}

// ---------------------------------------------------------------------------
// generateEncounter
// ---------------------------------------------------------------------------

export interface GenerateEncounterOpts {
  biome: BiomeId;
  tier: WorldTier;
  /** Average level of the player's active pack; the encounter's target level offsets from this. */
  packAvgLevel: number;
  kind: 'battle' | 'alpha' | 'apex';
  rng: Rng;
}

function hasSummonAdd(combatant: Combatant): boolean {
  return combatant.alphaMods.some((id) => ALPHA_MODS[id]?.effect.kind === 'summonAdd');
}

/**
 * Build the full enemy group for a node: 3 wilds (battle), 1 alpha + 2 wilds
 * (alpha), or the boss (+1 escort at tier >= 3) for apex. Any combatant that
 * ends up carrying the `summonAdd` alpha mod (Pack Leader, rolled here or
 * fixed into an Apex's mod set) adds one extra normal wild ally, per
 * engine.ts's note that `summonAdd` is realized at generation time.
 */
export function generateEncounter(opts: GenerateEncounterOpts): Combatant[] {
  const targetLevel = Math.round(opts.packAvgLevel) + ENEMY_LEVEL_OFFSET_BY_TIER[opts.tier];
  const spawnNormal = (): Combatant =>
    generateWildCombatant({ biome: opts.biome, tier: opts.tier, targetLevel, rng: opts.rng });

  const enemies: Combatant[] = [];

  if (opts.kind === 'apex') {
    const boss = generateWildCombatant({ biome: opts.biome, tier: opts.tier, targetLevel, rng: opts.rng, apex: true });
    boss.alphaMods = apexMods(opts.tier);
    enemies.push(boss);
    if (opts.tier >= 3) enemies.push(spawnNormal());
  } else if (opts.kind === 'alpha') {
    const alpha = generateWildCombatant({ biome: opts.biome, tier: opts.tier, targetLevel, rng: opts.rng, alpha: true });
    alpha.alphaMods = rollAlphaMods(opts.tier, opts.rng);
    enemies.push(alpha, spawnNormal(), spawnNormal());
  } else {
    enemies.push(spawnNormal(), spawnNormal(), spawnNormal());
  }

  if (enemies.some(hasSummonAdd)) enemies.push(spawnNormal());

  return enemies;
}

// ---------------------------------------------------------------------------
// generateTamedDino / generateStarter
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Convert a battle-won-over wild `Combatant` into an owned `DinoInstance`
 * (DESIGN §4.5). Keeps species/level/trait/appearanceSeed; nickname defaults
 * to the species name; a fresh quirk is rolled (wild dinos don't carry one —
 * `Combatant` has no quirk field); HP carries over as the fraction it ended
 * the battle with. If the wild dino was an Alpha (or Apex) with modifiers,
 * exactly one is kept as a permanent `alphaTrait`.
 */
export function generateTamedDino(combatant: Combatant, rng: Rng): DinoInstance {
  const species = requireSpecies(combatant.species);
  const currentHpPercent = combatant.stats.hp > 0 ? clamp01(combatant.currentHp / combatant.stats.hp) : 1;
  const alphaTrait: AlphaModId | undefined =
    combatant.alphaMods.length > 0 ? rng.pick(combatant.alphaMods) : undefined;

  return {
    uid: genUid('d', rng),
    species: combatant.species,
    nickname: species.name,
    level: combatant.level,
    xp: 0,
    quirk: rollQuirk(rng),
    trait: combatant.trait,
    alphaTrait,
    moves: movesAtLevel(species, combatant.level),
    gear: {},
    appearanceSeed: combatant.appearanceSeed,
    currentHpPercent,
  };
}

/** New-game starter dino: level 3, rolled quirk/trait, learnset moves so far. */
export function generateStarter(speciesId: SpeciesId, rng: Rng): DinoInstance {
  const species = requireSpecies(speciesId);
  const level = 3;
  return {
    uid: genUid('d', rng),
    species: speciesId,
    nickname: species.name,
    level,
    xp: 0,
    quirk: rollQuirk(rng),
    trait: rng.pick(species.traitPool),
    moves: movesAtLevel(species, level),
    gear: {},
    appearanceSeed: rng.int(1, 0x7fffffff),
    currentHpPercent: 1,
  };
}
