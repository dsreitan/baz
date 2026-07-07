/**
 * CLAWBOUND — tuning constants.
 *
 * Every number that shapes battle/progression/taming feel lives here so the
 * whole game can be balanced from one file (ARCHITECTURE §5). Nothing in
 * this file performs logic beyond simple derived-constant math; the engine,
 * stats, taming and progression modules read from it.
 *
 * Convention note: "percent" constants below are whole numbers (20 = 20%)
 * to match the data-table convention in src/data (moves/traits/affixes);
 * fractions (0..1) are used for chances and HP-relative amounts.
 */
import type { Aspect, Role, Stage, WorldTier } from './types';

// ---------------------------------------------------------------------------
// Damage formula
// ---------------------------------------------------------------------------

/** Random multiplier applied to every damage roll, inclusive on both ends. */
export const DAMAGE_VARIANCE_MIN = 0.9;
export const DAMAGE_VARIANCE_MAX = 1.1;

export const CRIT_MULTIPLIER = 1.5;
/** Fraction (0..1), before trait/affix/bond crit-chance bonuses. */
export const BASE_CRIT_CHANCE = 0.05;

/**
 * A `combo.ignoreDef` hit doesn't set DEF to zero (that would make damage
 * unbounded for very low-ATK attackers); instead the defender's effective
 * DEF is scaled down to this fraction of its normal value. Tuning decision:
 * flagged in the Phase 3 report since types.ts/DESIGN don't pin an exact
 * number for "ignores DEF".
 */
export const IGNORE_DEF_FACTOR = 0.3;

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/** Guard's DEF bonus, as a whole-number percent (matches the `harden` status power convention once divided by 100). */
export const GUARD_DEFENSE_BONUS_PERCENT = 50;
/** Guard lasts through the rest of the round ("until this dino's next turn"). */
export const GUARD_TURNS = 1;
/** Extra cooldown tick a guarding dino gets at end-of-round, on top of the normal -1. */
export const GUARD_EXTRA_COOLDOWN_TICK = 1;

// ---------------------------------------------------------------------------
// Maturation / stage stat bonuses (DESIGN §4.4)
// ---------------------------------------------------------------------------

export const MATURATION_LEVELS: { adult: number; alpha: number } = { adult: 10, alpha: 20 };

/** Whole-number percent stat bonus applied uniformly to all four stats at each stage. */
export const STAGE_STAT_BONUS_PERCENT: Record<Stage, number> = {
  juvenile: 0,
  adult: 10,
  alpha: 25,
};

// ---------------------------------------------------------------------------
// World Tier enemy scaling
// ---------------------------------------------------------------------------

export const ENEMY_LEVEL_OFFSET_BY_TIER: Record<WorldTier, number> = {
  1: 0,
  2: 3,
  3: 6,
  4: 10,
};

/** Extra flat stat multiplier per tier, on top of level-driven growth (Diablo-style toughness knob). */
export const ENEMY_STAT_MULTIPLIER_BY_TIER: Record<WorldTier, number> = {
  1: 1.0,
  2: 1.05,
  3: 1.1,
  4: 1.18,
};

/** Wild Alpha nodes: stat multiplier on top of the tier multiplier. */
export const ALPHA_STAT_MULTIPLIER = 1.2;
/** Apex bosses: stat multiplier on top of the tier multiplier. */
export const APEX_STAT_MULTIPLIER = 1.5;

// ---------------------------------------------------------------------------
// Taming (DESIGN §4.5)
// ---------------------------------------------------------------------------

/** A wild dino can only be targeted by Tame once its HP fraction drops below this. */
export const TAME_HP_ELIGIBLE_THRESHOLD = 0.35;
/** Base chance factor at 0 HP, before difficulty/lure/skill/status modifiers. */
export const TAME_BASE_CHANCE = 0.5;
/** Flat chance bonus if the target carries a sleep-like/chill/stun status. */
export const TAME_STATUS_BONUS = 0.15;
export const TAME_CHANCE_MIN = 0.05;
export const TAME_CHANCE_MAX = 0.9;
/** Bonus term added into the "(1 + lure + skills + affixes)" multiplier when Throw Lure was used. */
export const TAME_LURE_BONUS = 0.25;

// ---------------------------------------------------------------------------
// XP curve (progression.ts)
// ---------------------------------------------------------------------------

/** xp required to advance FROM level n TO n+1 ~= base * n^exponent (quadratic-ish, capped at level 30). */
export const DINO_XP_BASE = 20;
export const DINO_XP_EXPONENT = 2;
export const DINO_MAX_LEVEL = 30;

export const MASTER_XP_BASE = 40;
export const MASTER_XP_EXPONENT = 1.8;
export const MASTER_MAX_LEVEL = 20;

/** Packmaster skill points granted per level gained. */
export const SKILL_POINTS_PER_LEVEL = 1;

/** Battle XP reward per defeated enemy, scaled by its level. */
export const ENEMY_XP_PER_LEVEL = 8;

// ---------------------------------------------------------------------------
// Status defaults — magnitudes for statuses the engine applies itself
// (i.e. not sourced from a MoveDef/TraitDef/AffixDef).
// ---------------------------------------------------------------------------

export const STATUS_DEFAULTS = {
  /** Failed tame attempts enrage the target (+ATK) — DESIGN §4.5. */
  tameFailEnragePercent: 20,
  tameFailEnrageTurns: 2,
  /** stormheart_core legendary power. */
  stormheartChance: 0.25,
  stormheartTurns: 2,
  /** lifewarden_bloom legendary power. */
  lifewardenHpThreshold: 0.3,
  lifewardenRegenPercent: 8,
  lifewardenRegenTurns: 2,
  /** apex_hunger legendary power. */
  apexHungerDamagePercent: 20,
  /** `frenzy` alphaMod (types.ts gives no magnitude; DESIGN §2.4 "Frenzied" example: +30% ATK/SPD below 50% HP). */
  frenzyStatBonusPercent: 30,
  frenzyHpThreshold: 0.5,
};

// ---------------------------------------------------------------------------
// Pack Bonds (DESIGN §4.3)
// ---------------------------------------------------------------------------

export const ASPECT_BOND_DAMAGE_PERCENT = 15;
export const BALANCED_PACK_STAT_PERCENT = 5;

export interface RoleBondEffect {
  label: string;
  detail: string;
  /** Stat-percent bonds are folded straight into the snapshot StatBlock. */
  statBoost?: { stat: 'hp' | 'atk' | 'def' | 'spd'; percent: number };
  /** Everything else is applied dynamically during battle resolution. */
  damageTakenPercent?: number; // negative = damage reduction
  critChancePercent?: number;
  healPercent?: number;
  statusChanceBonus?: number; // fraction, added to applyStatus/debuff rolls
  debuffMagnitudePercent?: number; // multiplicative bump to debuff percent magnitudes
}

/**
 * Two-of-a-role perk table. DESIGN §4.3 only spells out Guardian and
 * Stalker explicitly ("etc."); Bruiser/Warden/Screecher perks below are a
 * Phase 3 authoring decision in the same spirit, documented in the report.
 */
export const ROLE_BOND_EFFECTS: Record<Role, RoleBondEffect> = {
  bruiser: {
    label: 'Bruiser Bond',
    detail: '+10% ATK.',
    statBoost: { stat: 'atk', percent: 10 },
  },
  guardian: {
    label: 'Guardian Bond',
    detail: 'Team takes -10% damage.',
    damageTakenPercent: -10,
  },
  stalker: {
    label: 'Stalker Bond',
    detail: '+10% critical hit chance.',
    critChancePercent: 10,
  },
  warden: {
    label: 'Warden Bond',
    detail: 'Healing done is +15% stronger.',
    healPercent: 15,
  },
  screecher: {
    label: 'Screecher Bond',
    detail: 'Status/debuff chance +15%, debuff magnitude +15%.',
    statusChanceBonus: 0.15,
    debuffMagnitudePercent: 15,
  },
};

// ---------------------------------------------------------------------------
// Enemy generation helpers (consumed by Phase 4 gen/, defined here per plan)
// ---------------------------------------------------------------------------

/** All 8 aspects, re-exported here for tuning tables that key by aspect. */
export type AspectTuningTable = Record<Aspect, number>;
