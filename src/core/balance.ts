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
import type { Aspect, Rarity, Role, Stage, WorldTier } from './types';

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
 * Phase 7 balance pass: a flat multiplier on every damage roll's final
 * amount (`engine.ts` `computeDamage`), applied after every other term
 * (power, ATK/DEF ratio, aspect/bond/combo/crit multipliers, variance).
 * Playtesting found strong-aspect hits one-shotting full-HP dinos at level
 * parity (e.g. a 65-power move at atk≈def landing ~125 on a 116-HP target)
 * — battles were resolving in 1-3 rounds instead of the DESIGN §9 target of
 * multi-round HP attrition. This single knob is the sim-driven fix (see
 * `balance-report.test.ts`); it does not change the formula's *shape*, only
 * its overall scale, so relative matchup swinginess (crits, aspect
 * advantage, combos) is preserved.
 */
export const GLOBAL_DAMAGE_SCALE = 0.4;

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

/**
 * Onboarding fix (Phase 7): a lone-dino active pack (i.e. before the player
 * has tamed 2 more) fights wilds `-1` level below the usual pack-avg+tier
 * formula, on top of the encounter also being scaled down to 1v1 (see
 * `gen/dino.ts` `generateEncounter`'s `packSize` param). Makes the very
 * first expedition (one level-3 starter) winnable and gives new players a
 * visibly tameable-level target on the first battle node.
 */
export const SMALL_PACK_LEVEL_OFFSET = -1;

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
export const APEX_STAT_MULTIPLIER = 1.4;

/**
 * Phase 7 balance pass: plain 'battle' node wilds (not Alpha, not Apex) get
 * this stat discount on top of the tier multiplier. A "fair fight" (equal
 * stats both sides) in this engine's 3v3 attrition formula lands close to a
 * 50/50 AI-vs-AI coin flip (see `balance-report.test.ts`'s notes) — but
 * DESIGN §9 wants ordinary encounters to be consistently winnable (~85-90%)
 * so Alpha/Apex nodes read as the escalation. This is the lever for that:
 * it only discounts plain 'battle' wilds, so Alpha (`ALPHA_STAT_MULTIPLIER`)
 * and Apex (`APEX_STAT_MULTIPLIER`) difficulty are untouched.
 */
export const NORMAL_BATTLE_STAT_MULTIPLIER = 0.82;

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

// ---------------------------------------------------------------------------
// Loot economy (Phase 4 gen/loot.ts) — additive Phase 4 extension.
// ---------------------------------------------------------------------------

/**
 * `AffixDef.min/max` (and `chanceMin/chanceMax`) are the roll range at the
 * ilvl-1 reference point (affixes.ts header comment); this is the missing
 * "how much stronger per item level" knob the Phase 4 brief asked for:
 * `value = roll(min..max) × (1 + AFFIX_ILVL_SCALING × (ilvl - 1))`.
 */
export const AFFIX_ILVL_SCALING = 0.03;

/** Essence yielded by salvaging gear, keyed by rarity, before AFFIX_ILVL_SCALING. */
export const SALVAGE_ESSENCE_BASE: Record<Rarity, number> = {
  common: 5,
  uncommon: 10,
  rare: 20,
  epic: 40,
  legendary: 80,
};

/** Essence yielded by releasing a tamed dino, per dino level (DESIGN §5 "Essence"). */
export const RELEASE_ESSENCE_PER_LEVEL = 3;

/**
 * Essence cost to upgrade an item one rarity step, keyed by its CURRENT
 * rarity, before ilvl scaling. Legendary is already the max step (DESIGN §5
 * "Rarities: ... Legendary"; `upgradeItem` no-ops on it) — its entry exists
 * only so the table stays total and every rarity maps to a positive cost.
 */
export const UPGRADE_ESSENCE_COST: Record<Rarity, number> = {
  common: 20,
  uncommon: 40,
  rare: 80,
  epic: 160,
  legendary: 160,
};

// ---------------------------------------------------------------------------
// Reward loot (Phase 4 gen/loot.ts, DESIGN §5/§7 reward tables)
// ---------------------------------------------------------------------------

export const BATTLE_LOOT_CHANCE = 0.4;
export const CACHE_SECOND_ITEM_CHANCE = 0.5;
export const CACHE_LOOT_RARITY_BOOST = 1;
export const ALPHA_LOOT_MIN_RARITY: Rarity = 'rare';
export const APEX_LOOT_MIN_RARITY: Rarity = 'epic';
export const APEX_LOOT_ITEM_COUNT = 2;

export const BATTLE_ESSENCE_RANGE: [number, number] = [3, 8];
export const ALPHA_ESSENCE_RANGE: [number, number] = [10, 20];
export const CACHE_ESSENCE_RANGE: [number, number] = [8, 15];
export const APEX_ESSENCE_RANGE: [number, number] = [30, 50];

// ---------------------------------------------------------------------------
// Phase 6 additions — reserve size, inventory cap, grove healing, defeat
// loot retention, packmaster battle-xp share, skill respec cost. Additive
// only (ground rule: "balance.ts additive constants"); consumed by the new
// `src/core/run.ts` expedition-runner reducer and the UI screens.
// ---------------------------------------------------------------------------

/** Reserve holds this many dinos before any Handler `reserveSize` skill bonus (DESIGN §6). */
export const RESERVE_SIZE_BASE = 6;

/** Inventory grid hard cap; loot beyond this overflows into a salvage prompt (Phase 6 brief). */
export const INVENTORY_CAP = 60;

/** Grove heal-team percent before any Survivalist `groveHealBonus` skill (DESIGN §7). */
export const GROVE_HEAL_BASE_PERCENT = 50;

/**
 * Loot/essence percent kept when an expedition ends in defeat, before any
 * `defeatLootKeep` skill bonus (DESIGN §3: "keep... half the loot found so
 * far").
 */
export const DEFEAT_LOOT_KEEP_BASE_PERCENT = 50;

/** Packmaster XP earned per battle, as a percent of the dino XP pool (DESIGN §6: XP "earned alongside the pack"). */
export const MASTER_XP_SHARE_OF_BATTLE_PERCENT = 50;

/** Essence cost to respec the entire skill tree (DESIGN §6: "Respec at Camp for essence"). */
export const SKILL_RESPEC_ESSENCE_COST = 60;
