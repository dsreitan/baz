/**
 * Progression: XP curves, level-ups, maturation, move-learn discovery,
 * packmaster skill points, and skill-tree gating (ARCHITECTURE §5,
 * DESIGN §4.4/§6).
 *
 * `grantBattleXp` is deliberately decoupled from `BattleState`/the battle
 * engine's internals (it takes plain `DinoInstance[]`/level data) so it can
 * be called from the expedition runner (Phase 4/6) without importing
 * engine internals, and so it's trivially unit-testable here. `BattleState`
 * doesn't carry a reserve list at all (see engine.ts's `BattleRuntime` doc)
 * so this module never assumes one is derivable from it.
 */
import { SKILLS, SPECIES } from '../data/index';
import { DINO_MAX_LEVEL, DINO_XP_BASE, DINO_XP_EXPONENT, ENEMY_XP_PER_LEVEL, MASTER_MAX_LEVEL, MASTER_XP_BASE, MASTER_XP_EXPONENT, SKILL_POINTS_PER_LEVEL } from './balance';
import { stageForLevel } from './stats';
import type { DinoInstance, MoveId, PackmasterState, SkillId, SpeciesDef, Stage, Uid } from './types';

/** XP required to advance FROM `level` TO `level + 1` (dino curve, ~quadratic to level 30). */
export function xpForLevel(level: number): number {
  return Math.round(DINO_XP_BASE * Math.pow(level, DINO_XP_EXPONENT));
}

/** XP required to advance FROM `level` TO `level + 1` (packmaster curve, to level 20). */
export function masterXpForLevel(level: number): number {
  return Math.round(MASTER_XP_BASE * Math.pow(level, MASTER_XP_EXPONENT));
}

/** Learnset moves unlocked strictly between `fromLevel` (exclusive) and `toLevel` (inclusive). */
export function newlyLearnableMoves(species: SpeciesDef, fromLevel: number, toLevel: number): MoveId[] {
  return species.learnset.filter((entry) => entry.level > fromLevel && entry.level <= toLevel).map((entry) => entry.move);
}

export interface LevelUpEvent {
  uid: Uid;
  fromLevel: number;
  toLevel: number;
}

export interface MaturationEvent {
  uid: Uid;
  stage: Stage;
}

export interface GrantXpResult {
  xpAwarded: Record<Uid, number>;
  levelUps: LevelUpEvent[];
  maturations: MaturationEvent[];
  /** newly learnable moves per dino uid that leveled up (does not auto-equip — 4 active slots, chosen at Camp) */
  newlyLearnable: Record<Uid, MoveId[]>;
}

/** Mutates `dino` in place (xp/level), recording level-up/maturation/learnset events onto `result`. */
function applyXpToDino(dino: DinoInstance, xpGained: number, result: GrantXpResult): void {
  if (xpGained <= 0) return;
  const species = SPECIES[dino.species];
  const startLevel = dino.level;
  const startStage = stageForLevel(dino.level);

  dino.xp += xpGained;
  while (dino.level < DINO_MAX_LEVEL && dino.xp >= xpForLevel(dino.level)) {
    dino.xp -= xpForLevel(dino.level);
    dino.level += 1;
    result.levelUps.push({ uid: dino.uid, fromLevel: dino.level - 1, toLevel: dino.level });
  }
  if (dino.level >= DINO_MAX_LEVEL) dino.xp = 0;

  const endStage = stageForLevel(dino.level);
  if (endStage !== startStage) result.maturations.push({ uid: dino.uid, stage: endStage });

  if (dino.level > startLevel && species) {
    const learned = newlyLearnableMoves(species, startLevel, dino.level);
    if (learned.length > 0) result.newlyLearnable[dino.uid] = learned;
  }
}

export interface BattleXpInput {
  /** Dinos that fought this battle — each receives the full XP award. */
  active: DinoInstance[];
  /** Benched dinos this expedition — receive `benchXpShare`% of the full award, if any Handler skill grants it. */
  reserve: DinoInstance[];
  /** Levels of the enemies defeated, used to compute the total XP pool. */
  defeatedEnemyLevels: number[];
  skills: SkillId[];
}

/** Splits battle XP across active participants (full share each) and reserve (benchXpShare% each), applying level-ups in place. */
export function grantBattleXp(input: BattleXpInput): GrantXpResult {
  const totalXp = input.defeatedEnemyLevels.reduce((sum, level) => sum + ENEMY_XP_PER_LEVEL * level, 0);
  const benchSharePercent = input.skills.reduce((sum, id) => {
    const skill = SKILLS[id];
    return skill?.effect.kind === 'benchXpShare' ? sum + skill.effect.percent : sum;
  }, 0);

  const result: GrantXpResult = { xpAwarded: {}, levelUps: [], maturations: [], newlyLearnable: {} };

  for (const dino of input.active) {
    result.xpAwarded[dino.uid] = totalXp;
    applyXpToDino(dino, totalXp, result);
  }

  if (benchSharePercent > 0) {
    const benchXp = Math.round((totalXp * benchSharePercent) / 100);
    for (const dino of input.reserve) {
      result.xpAwarded[dino.uid] = benchXp;
      applyXpToDino(dino, benchXp, result);
    }
  }

  return result;
}

export interface MasterXpResult {
  levelsGained: number;
  skillPointsGained: number;
}

/** Mutates `master` in place (xp/level/skillPoints). */
export function grantMasterXp(master: PackmasterState, xpGained: number): MasterXpResult {
  if (xpGained <= 0) return { levelsGained: 0, skillPointsGained: 0 };
  let levelsGained = 0;
  master.xp += xpGained;
  while (master.level < MASTER_MAX_LEVEL && master.xp >= masterXpForLevel(master.level)) {
    master.xp -= masterXpForLevel(master.level);
    master.level += 1;
    levelsGained += 1;
  }
  if (master.level >= MASTER_MAX_LEVEL) master.xp = 0;
  const skillPointsGained = levelsGained * SKILL_POINTS_PER_LEVEL;
  master.skillPoints += skillPointsGained;
  return { levelsGained, skillPointsGained };
}

/**
 * Skill-tree gating (SkillDef doc comment): tier 1 nodes are always
 * unlockable; tier n+1 requires any already-owned tier-n node in the same
 * branch.
 */
export function canUnlockSkill(ownedSkills: SkillId[], candidateId: SkillId): boolean {
  const candidate = SKILLS[candidateId];
  if (!candidate) return false;
  if (ownedSkills.includes(candidateId)) return false;
  if (candidate.tier <= 1) return true;
  return ownedSkills.some((id) => {
    const owned = SKILLS[id];
    return owned != null && owned.branch === candidate.branch && owned.tier === candidate.tier - 1;
  });
}
