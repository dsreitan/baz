/**
 * Derived stats & pack bonds (ARCHITECTURE §3, DESIGN §4.3/§4.4).
 *
 * `deriveStats` turns a `DinoInstance` (species + level + quirk + trait +
 * gear) into a concrete `StatBlock`. `computeBonds` evaluates the DESIGN
 * §4.3 synergy layer on an active trio for display (`PackBond[]`, stored on
 * `BattleState`); `bondEffectsForPack` computes the same information as
 * numeric modifiers the battle engine can actually apply (PackBond has no
 * numeric fields — see ARCHITECTURE/types.ts — so the engine needs this
 * parallel structured form).
 */
import { SPECIES, TRAITS, AFFIXES } from '../data/index';
import {
  ASPECT_BOND_DAMAGE_PERCENT,
  BALANCED_PACK_STAT_PERCENT,
  ENEMY_STAT_MULTIPLIER_BY_TIER,
  MATURATION_LEVELS,
  ROLE_BOND_EFFECTS,
  STAGE_STAT_BONUS_PERCENT,
} from './balance';
import { ASPECT_WHEEL } from './types';
import type {
  Aspect,
  DinoGearSlot,
  DinoInstance,
  PackBond,
  Role,
  SpeciesDef,
  SpeciesId,
  Stage,
  StatBlock,
  StatKey,
  WorldTier,
} from './types';

const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spd'];

/** Maturation stage from level: <10 juvenile, <20 adult, else alpha (DESIGN §4.4). */
export function stageForLevel(level: number): Stage {
  if (level < MATURATION_LEVELS.adult) return 'juvenile';
  if (level < MATURATION_LEVELS.alpha) return 'adult';
  return 'alpha';
}

function zeroStatBlock(): StatBlock {
  return { hp: 0, atk: 0, def: 0, spd: 0 };
}

/**
 * Derive a dino's live stat block from species base + growth×(level−1),
 * quirk, trait (statPercent only — other trait kinds are combat-time
 * modifiers interpreted by the battle engine), gear affixes (statFlat then
 * statPercent, per Phase 3 brief), and stage bonus.
 */
export function deriveStats(dino: DinoInstance): StatBlock {
  const species = SPECIES[dino.species];
  if (!species) {
    throw new Error(`deriveStats: unknown species "${dino.species}"`);
  }
  const level = dino.level;
  const stage = stageForLevel(level);

  const raw = zeroStatBlock();
  const flatBonus = zeroStatBlock();
  const percentBonus = zeroStatBlock();

  for (const key of STAT_KEYS) {
    raw[key] = species.baseStats[key] + species.growth[key] * (level - 1);
  }

  // Quirk: +5-10% to one stat.
  percentBonus[dino.quirk.stat] += dino.quirk.percent;

  // Trait: only statPercent affects raw stats here.
  const trait = TRAITS[dino.trait];
  if (trait && trait.effect.kind === 'statPercent') {
    percentBonus[trait.effect.stat] += trait.effect.percent;
  }

  // Gear: statFlat pass, then statPercent pass (explicit ordering per brief).
  const items = (Object.keys(dino.gear) as DinoGearSlot[])
    .map((slot) => dino.gear[slot])
    .filter((item): item is NonNullable<typeof item> => item != null);

  for (const item of items) {
    for (const rolled of item.affixes) {
      const affix = AFFIXES[rolled.affix];
      if (affix?.effect.kind === 'statFlat') {
        flatBonus[affix.effect.stat] += rolled.value;
      }
    }
  }
  for (const item of items) {
    for (const rolled of item.affixes) {
      const affix = AFFIXES[rolled.affix];
      if (affix?.effect.kind === 'statPercent') {
        percentBonus[affix.effect.stat] += rolled.value;
      }
    }
  }

  // Stage bonus (maturation): applies uniformly to all four stats.
  const stagePercent = STAGE_STAT_BONUS_PERCENT[stage];
  for (const key of STAT_KEYS) percentBonus[key] += stagePercent;

  const result = zeroStatBlock();
  for (const key of STAT_KEYS) {
    const withFlat = raw[key] + flatBonus[key];
    result[key] = Math.max(1, Math.round(withFlat * (1 + percentBonus[key] / 100)));
  }
  return result;
}

/**
 * Enemy stat derivation for a given species/level/World Tier: species base +
 * growth×(level−1), then the tier's flat stat multiplier (on top of the
 * level offset already baked into `level` by the generator). Alpha/apex
 * multipliers (balance.ts `ALPHA_STAT_MULTIPLIER`/`APEX_STAT_MULTIPLIER`)
 * are applied by the Phase 4 generator on top of this base, not here.
 */
export function deriveEnemyStats(species: SpeciesDef, level: number, tier: WorldTier): StatBlock {
  const tierMult = ENEMY_STAT_MULTIPLIER_BY_TIER[tier];
  const result = zeroStatBlock();
  for (const key of STAT_KEYS) {
    const raw = species.baseStats[key] + species.growth[key] * (level - 1);
    result[key] = Math.max(1, Math.round(raw * tierMult));
  }
  return result;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface PackMember {
  species: SpeciesId;
  role: Role;
  aspect: Aspect;
}

/**
 * Display-oriented pack bonds for the active trio (DESIGN §4.3), stored on
 * `BattleState.playerBonds`/`enemyBonds`. For the *numeric* effect of each
 * bond (used by the battle engine to actually modify damage/stats), see
 * `bondEffectsForPack` below — `PackBond` itself carries no magnitude.
 */
export function computeBonds(pack: PackMember[]): PackBond[] {
  const bonds: PackBond[] = [];
  const aspectCounts = new Map<Aspect, number>();
  const roleCounts = new Map<Role, number>();
  for (const member of pack) {
    aspectCounts.set(member.aspect, (aspectCounts.get(member.aspect) ?? 0) + 1);
    roleCounts.set(member.role, (roleCounts.get(member.role) ?? 0) + 1);
  }

  for (const aspect of ASPECT_WHEEL) {
    if ((aspectCounts.get(aspect) ?? 0) >= 2) {
      bonds.push({
        kind: 'aspect',
        label: `${titleCase(aspect)} Bond`,
        detail: `+${ASPECT_BOND_DAMAGE_PERCENT}% damage with ${titleCase(aspect)} moves.`,
      });
    }
  }

  const roleOrder: Role[] = ['bruiser', 'guardian', 'stalker', 'warden', 'screecher'];
  for (const role of roleOrder) {
    if ((roleCounts.get(role) ?? 0) >= 2) {
      const effect = ROLE_BOND_EFFECTS[role];
      bonds.push({ kind: 'role', label: effect.label, detail: effect.detail });
    }
  }

  if (pack.length === 3 && roleCounts.size === 3) {
    bonds.push({
      kind: 'balanced',
      label: 'Balanced Pack',
      detail: `+${BALANCED_PACK_STAT_PERCENT}% to all stats.`,
    });
  }

  return bonds;
}

/** Numeric modifiers a bond applies dynamically during battle (not baked into the stat snapshot). */
export interface SideBondEffects {
  aspectDamagePercent: Partial<Record<Aspect, number>>;
  damageTakenPercent: number;
  critChancePercent: number;
  healPercent: number;
  statusChanceBonus: number;
  debuffMagnitudePercent: number;
  /** Stat-percent bonds (Bruiser role bond, Balanced Pack) — baked into the stat snapshot at battle creation. */
  statBoosts: { stat: StatKey; percent: number }[];
}

/** Same inputs as `computeBonds`, but returns the numeric modifiers instead of display labels. */
export function bondEffectsForPack(pack: { role: Role; aspect: Aspect }[]): SideBondEffects {
  const result: SideBondEffects = {
    aspectDamagePercent: {},
    damageTakenPercent: 0,
    critChancePercent: 0,
    healPercent: 0,
    statusChanceBonus: 0,
    debuffMagnitudePercent: 0,
    statBoosts: [],
  };

  const aspectCounts = new Map<Aspect, number>();
  const roleCounts = new Map<Role, number>();
  for (const member of pack) {
    aspectCounts.set(member.aspect, (aspectCounts.get(member.aspect) ?? 0) + 1);
    roleCounts.set(member.role, (roleCounts.get(member.role) ?? 0) + 1);
  }

  for (const [aspect, count] of aspectCounts) {
    if (count >= 2) {
      result.aspectDamagePercent[aspect] = (result.aspectDamagePercent[aspect] ?? 0) + ASPECT_BOND_DAMAGE_PERCENT;
    }
  }

  for (const [role, count] of roleCounts) {
    if (count < 2) continue;
    const effect = ROLE_BOND_EFFECTS[role];
    if (effect.statBoost) result.statBoosts.push(effect.statBoost);
    if (effect.damageTakenPercent) result.damageTakenPercent += effect.damageTakenPercent;
    if (effect.critChancePercent) result.critChancePercent += effect.critChancePercent;
    if (effect.healPercent) result.healPercent += effect.healPercent;
    if (effect.statusChanceBonus) result.statusChanceBonus += effect.statusChanceBonus;
    if (effect.debuffMagnitudePercent) result.debuffMagnitudePercent += effect.debuffMagnitudePercent;
  }

  if (pack.length === 3 && roleCounts.size === 3) {
    for (const stat of STAT_KEYS) {
      result.statBoosts.push({ stat, percent: BALANCED_PACK_STAT_PERCENT });
    }
  }

  return result;
}
