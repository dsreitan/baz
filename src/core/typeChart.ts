/**
 * Primal Aspect wheel — see DESIGN.md §4.1.
 *
 * Wheel order (ASPECT_WHEEL in types.ts):
 *   Ember → Frost → Verdant → Stone → Storm → Tide → Venom → Rune → (Ember)
 *
 * Each aspect is strong (×1.5) against the next two aspects clockwise,
 * and weak (×0.67) against the previous two aspects (i.e. the two aspects
 * for which it is itself two-or-fewer steps clockwise from them).
 */
import { ASPECT_WHEEL, type Aspect } from './types';

const WHEEL_SIZE = ASPECT_WHEEL.length;

const INDEX_BY_ASPECT: Record<Aspect, number> = Object.fromEntries(
  ASPECT_WHEEL.map((aspect, i) => [aspect, i]),
) as Record<Aspect, number>;

const STRONG_MULTIPLIER = 1.5;
const WEAK_MULTIPLIER = 0.67;
const NEUTRAL_MULTIPLIER = 1;

/**
 * Damage multiplier for an attacker's aspect against a defender's aspect.
 *
 * +1 or +2 steps clockwise from attacker to defender → attacker is strong (1.5×).
 * -1 or -2 steps (i.e. defender is +1/+2 clockwise from attacker's position
 * going the other way — equivalently attacker is 1 or 2 steps counter-
 * clockwise from defender) → attacker is weak (0.67×).
 * Everything else (same aspect, or 3-4 steps away on an 8-wheel) → neutral (1×).
 */
export function aspectMultiplier(attacker: Aspect, defender: Aspect): number {
  const attackerIdx = INDEX_BY_ASPECT[attacker];
  const defenderIdx = INDEX_BY_ASPECT[defender];

  // Steps from attacker to defender going clockwise, normalized to [0, WHEEL_SIZE).
  const clockwiseSteps = ((defenderIdx - attackerIdx) % WHEEL_SIZE + WHEEL_SIZE) % WHEEL_SIZE;

  if (clockwiseSteps === 1 || clockwiseSteps === 2) {
    return STRONG_MULTIPLIER;
  }
  // Defender is 1 or 2 steps clockwise from attacker means attacker is 1 or 2
  // steps counter-clockwise from defender: attacker is weak against it.
  if (clockwiseSteps === WHEEL_SIZE - 1 || clockwiseSteps === WHEEL_SIZE - 2) {
    return WEAK_MULTIPLIER;
  }
  return NEUTRAL_MULTIPLIER;
}
