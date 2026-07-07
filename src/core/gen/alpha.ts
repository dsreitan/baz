/**
 * Alpha modifier rolls (DESIGN §2.4, ARCHITECTURE gen/alpha.ts).
 *
 * Wild Alphas roll 1-3 random modifiers from `data/alphaMods.ts` scaled by
 * World Tier; Apex bosses instead get a fixed, thematically-ordered set per
 * tier (bigger, nastier sets at higher tiers) plus the flat
 * `APEX_STAT_MULTIPLIER` (applied by `gen/dino.ts`, not here — this module
 * only ever returns `AlphaModId[]`).
 */
import { ALPHA_MOD_LIST } from '../../data/index';
import type { AlphaModId, Rng, WorldTier } from '../types';

/** [min, max] inclusive mod count per World Tier — DESIGN §2.4 "1-3 random modifiers". */
const ALPHA_MOD_COUNT_RANGE: Record<WorldTier, [number, number]> = {
  1: [1, 1],
  2: [1, 2],
  3: [2, 2],
  4: [2, 3],
};

/** Roll a duplicate-free set of alpha modifiers for a wild Alpha at `tier`. */
export function rollAlphaMods(tier: WorldTier, rng: Rng): AlphaModId[] {
  const [min, max] = ALPHA_MOD_COUNT_RANGE[tier];
  const count = rng.int(min, max);
  const pool = rng.shuffle(ALPHA_MOD_LIST.map((m) => m.id));
  return pool.slice(0, count);
}

/**
 * Fixed thematic mod sets for Apex bosses, sized by tier. Not randomized —
 * every Apex fight at a given tier presents the same modifier set, so
 * players can learn to play around it; only the underlying stats/level
 * (from `gen/dino.ts`) vary run to run.
 */
const APEX_MOD_SETS: Record<WorldTier, AlphaModId[]> = {
  1: ['stoneskin'],
  2: ['stoneskin', 'frenzied'],
  3: ['stoneskin', 'frenzied', 'thorned'],
  4: ['stoneskin', 'frenzied', 'thorned', 'bulwark'],
};

/** Fixed modifier set for an Apex boss at `tier`. */
export function apexMods(tier: WorldTier): AlphaModId[] {
  return APEX_MOD_SETS[tier];
}
