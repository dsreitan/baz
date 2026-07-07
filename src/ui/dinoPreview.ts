/**
 * Owned dinos are `DinoInstance` (types.ts); the battle-era `dinoCard`
 * component (Phase 5) renders a `Combatant`. Every non-battle screen that
 * shows an owned dino as a card (Camp, Pack, Gear previews, Reward tame
 * results, MainMenu starter picker) needs the same conversion, so it lives
 * here once rather than N times.
 */
import { deriveStats, stageForLevel } from '../core/stats';
import type { Combatant, DinoInstance, MoveId } from '../core/types';

/** Render-only projection of a `DinoInstance` into the `Combatant` shape `dinoCard`/`healthBar` expect. Not a real battle participant — `side` is always `'player'`, cooldowns are always 0. */
export function dinoToCombatant(dino: DinoInstance): Combatant {
  const stats = deriveStats(dino);
  const currentHp = Math.max(0, Math.round(stats.hp * dino.currentHpPercent));
  const cooldowns: Record<MoveId, number> = {};
  for (const move of dino.moves) cooldowns[move] = 0;
  return {
    uid: dino.uid,
    side: 'player',
    species: dino.species,
    nickname: dino.nickname,
    level: dino.level,
    stage: stageForLevel(dino.level),
    stats,
    currentHp,
    shield: 0,
    statuses: [],
    cooldowns,
    moves: dino.moves,
    trait: dino.trait,
    alphaMods: dino.alphaTrait ? [dino.alphaTrait] : [],
    appearanceSeed: dino.appearanceSeed,
    tameable: false,
    fainted: dino.currentHpPercent <= 0,
  };
}
