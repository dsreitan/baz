/**
 * Enemy (and headless-sim) action selection (ARCHITECTURE §5).
 *
 * Scores every action `legalActions` offers for the current turn-holder and
 * picks (mostly) the best, with a little randomness for flavor. Heuristics:
 *  - combo consumption is heavily preferred when the target carries the
 *    matching marker status;
 *  - otherwise, highest expected damage (power × aspect multiplier × ATK/DEF,
 *    using base stat snapshots — the AI doesn't need engine-perfect effective
 *    stats to be a reasonable opponent);
 *  - Wardens favor healing an ally below 50% HP, scaled by how wounded they
 *    are (naturally targets the lowest-HP ally without a special case);
 *  - Screechers favor debuffing a target that isn't already debuffed;
 *  - cooldowns/stun are already respected because we only ever choose among
 *    `legalActions(state)`.
 */
import { MOVES, SPECIES } from '../../data/index';
import { aspectMultiplier } from '../typeChart';
import { statForStatKey } from './effects';
import { legalActions } from './engine';
import type { BattleAction, BattleState, Combatant, MoveDef, Rng } from '../types';

/** Chance the AI picks its second-best option instead of the top-scored one. */
const RANDOMNESS = 0.15;

function livingOn(state: BattleState, side: Combatant['side']): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.fainted);
}

function affectedTargets(state: BattleState, actor: Combatant, moveDef: MoveDef, primary: Combatant): Combatant[] {
  const enemySide = actor.side === 'player' ? 'enemy' : 'player';
  switch (moveDef.targets) {
    case 'self':
      return [actor];
    case 'enemy':
    case 'ally':
      return [primary];
    case 'all-enemies':
      return livingOn(state, enemySide);
    case 'all-allies':
      return livingOn(state, actor.side);
  }
}

function scoreMove(state: BattleState, actor: Combatant, action: Extract<BattleAction, { type: 'move' }>): number {
  const moveDef = MOVES[action.move];
  const primary = state.combatants.find((c) => c.uid === action.target);
  if (!moveDef || !primary) return -Infinity;

  const targets = affectedTargets(state, actor, moveDef, primary);
  let score = 0;

  for (const effect of moveDef.effects) {
    if (effect.kind === 'damage') {
      for (const target of targets) {
        const targetSpecies = SPECIES[target.species];
        const aspectMult = targetSpecies ? aspectMultiplier(moveDef.aspect, targetSpecies.aspect) : 1;
        const expected = effect.power * (actor.stats.atk / Math.max(1, target.stats.def)) * aspectMult;
        score += expected;
        if (moveDef.combo && target.statuses.some((s) => s.id === moveDef.combo!.consumes)) {
          // Strongly prefer cashing in a combo state over letting it expire.
          score += expected * 2 + 30;
        }
      }
    } else if (effect.kind === 'heal') {
      for (const target of targets) {
        const hpFraction = target.stats.hp > 0 ? target.currentHp / target.stats.hp : 1;
        if (hpFraction < 0.5) score += (0.5 - hpFraction) * target.stats.hp * 2;
      }
    } else if (effect.kind === 'debuff') {
      const statusId = statForStatKey(effect.stat);
      for (const target of targets) {
        const alreadyDebuffed = statusId != null && target.statuses.some((s) => s.id === statusId && s.power < 0);
        score += alreadyDebuffed ? 4 : 18;
      }
    } else if (effect.kind === 'applyStatus') {
      for (const target of targets) {
        const alreadyApplied = target.statuses.some((s) => s.id === effect.status);
        score += alreadyApplied ? 2 : 12;
      }
    } else if (effect.kind === 'buff') {
      score += 8;
    } else if (effect.kind === 'shield') {
      score += 6;
    } else if (effect.kind === 'cleanse') {
      score += targets.some((t) => t.statuses.length > 0) ? 10 : 0;
    }
  }

  return score;
}

function scoreAction(state: BattleState, actor: Combatant, action: BattleAction): number {
  switch (action.type) {
    case 'move':
      return scoreMove(state, actor, action);
    case 'guard':
      return 5;
    case 'tame':
      return 15;
    case 'swap':
      return 3;
    case 'command':
      return 1;
  }
}

/** Choose an action for whoever the current turn-holder is (enemy or player side). */
export function chooseAction(state: BattleState, rng: Rng): BattleAction {
  const uid = state.turnQueue[state.turnIndex];
  const actor = state.combatants.find((c) => c.uid === uid);
  const actions = legalActions(state);
  if (actions.length === 0) {
    // Should not happen (guard is always legal for the active combatant), but
    // fail safe rather than crash a headless sim.
    return { type: 'guard' };
  }
  if (!actor) return actions[0] as BattleAction;

  const scored = actions
    .map((action) => ({ action, score: scoreAction(state, actor, action) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length > 1 && rng.chance(RANDOMNESS)) {
    return scored[1]!.action;
  }
  return scored[0]!.action;
}
