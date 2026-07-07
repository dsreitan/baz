/**
 * Taming (DESIGN §4.5): weaken a wild dino below 35% HP, then any player
 * turn can be spent attempting to tame it. Chance scales with missing HP,
 * helpful statuses, lure quality, and Handler skills/gear; failure enrages
 * the target unless the attempter holds `lure_of_the_wilds`.
 */
import { SPECIES } from '../../data/index';
import {
  TAME_BASE_CHANCE,
  TAME_CHANCE_MAX,
  TAME_CHANCE_MIN,
  TAME_HP_ELIGIBLE_THRESHOLD,
  TAME_LURE_BONUS,
  TAME_STATUS_BONUS,
  STATUS_DEFAULTS,
} from '../balance';
import { applyStatus } from './effects';
import type { Combatant, Rng } from '../types';

export interface TameContext {
  /** Throw Lure was used earlier this battle and hasn't been consumed yet. */
  lureActive: boolean;
  /** Sum of Handler skill `tameChance` percents. */
  skillTameChancePercent: number;
  /** Sum of satchel affix `tameChance` percents. */
  affixTameChancePercent: number;
}

const HELPFUL_STATUSES = new Set(['chill', 'stun']);

/**
 * `base(1 − hpFraction) × (1/tameDifficulty) × (1 + lure + skills + affixes)`,
 * with a flat bonus if the target carries a sleep-like/chill/stun status.
 * Returns 0 if the target isn't below the eligibility threshold (35% HP).
 */
export function tameChance(target: Combatant, ctx: TameContext): number {
  const maxHp = target.stats.hp;
  const hpFraction = maxHp > 0 ? target.currentHp / maxHp : 0;
  if (hpFraction >= TAME_HP_ELIGIBLE_THRESHOLD) return 0;

  const difficulty = SPECIES[target.species]?.tameDifficulty ?? 1;
  let chance = (TAME_BASE_CHANCE * (1 - hpFraction)) / difficulty;

  const multiplier =
    1 + (ctx.lureActive ? TAME_LURE_BONUS : 0) + ctx.skillTameChancePercent / 100 + ctx.affixTameChancePercent / 100;
  chance *= multiplier;

  if (target.statuses.some((s) => HELPFUL_STATUSES.has(s.id))) {
    chance += TAME_STATUS_BONUS;
  }

  return Math.min(TAME_CHANCE_MAX, Math.max(TAME_CHANCE_MIN, chance));
}

export interface ResolveTameResult {
  success: boolean;
  chance: number;
  /** whether the failure enraged the target (false on success, or if `lure_of_the_wilds` suppressed it) */
  enraged: boolean;
}

/**
 * Resolve a tame attempt against `target`, mutating its statuses on
 * failure (enrage) unless the attempter's gear grants `lure_of_the_wilds`.
 */
export function resolveTame(target: Combatant, ctx: TameContext, rng: Rng, lureOfWilds: boolean): ResolveTameResult {
  const chance = tameChance(target, ctx);
  const success = rng.chance(chance);
  let enraged = false;
  if (!success && !lureOfWilds) {
    const result = applyStatus(
      target,
      'enrage',
      STATUS_DEFAULTS.tameFailEnrageTurns,
      STATUS_DEFAULTS.tameFailEnragePercent / 100,
      { chance: 1, rng },
    );
    enraged = result.applied;
  }
  return { success, chance, enraged };
}
