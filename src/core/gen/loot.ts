/**
 * Item generation (DESIGN §5, ARCHITECTURE gen/loot.ts): rarity roll,
 * slot-legal affix rolls, naming, essence salvage/release, upgrades, and the
 * per-node-kind reward tables (DESIGN §3/§7).
 */
import { AFFIX_LIST, AFFIXES, BASE_NAMES, LEGENDARY_POWERS, RARITY_WEIGHTS } from '../../data/index';
import {
  AFFIX_ILVL_SCALING,
  ALPHA_ESSENCE_RANGE,
  ALPHA_LOOT_MIN_RARITY,
  APEX_ESSENCE_RANGE,
  APEX_LOOT_ITEM_COUNT,
  APEX_LOOT_MIN_RARITY,
  BATTLE_ESSENCE_RANGE,
  BATTLE_LOOT_CHANCE,
  CACHE_ESSENCE_RANGE,
  CACHE_LOOT_RARITY_BOOST,
  CACHE_SECOND_ITEM_CHANCE,
  RELEASE_ESSENCE_PER_LEVEL,
  SALVAGE_ESSENCE_BASE,
  UPGRADE_ESSENCE_COST,
} from '../balance';
import type {
  AffixDef,
  DinoGearSlot,
  DinoInstance,
  GearSlot,
  ItemInstance,
  MasterGearSlot,
  NodeKind,
  Rarity,
  RolledAffix,
  Rng,
  Uid,
  WorldTier,
} from '../types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const UID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function genUid(prefix: string, rng: Rng): Uid {
  let s = '';
  for (let i = 0; i < 10; i++) s += rng.pick(UID_ALPHABET.split(''));
  return `${prefix}_${s}`;
}

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Affix count entitled at each rarity (DESIGN §5): common 0 .. legendary 3 (+ a legendary power). */
export const AFFIX_COUNT_BY_RARITY: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 3,
};

const DINO_SLOTS: DinoGearSlot[] = ['plating', 'talon', 'charm'];
const MASTER_SLOTS: MasterGearSlot[] = ['whistle', 'satchel', 'standard'];

const LEGENDARY_EPITHETS = [
  'the Storm Tyrant',
  'the Ancient Wyrm',
  'the First Hunt',
  'the Devouring Dark',
  'the Sundered Peak',
  'the Endless Tide',
  'the Wyrmqueen',
  'the Last Ember',
];

function ilvlScale(ilvl: number): number {
  return 1 + AFFIX_ILVL_SCALING * (ilvl - 1);
}

// ---------------------------------------------------------------------------
// generateItem
// ---------------------------------------------------------------------------

export interface GenerateItemOpts {
  ilvl: number;
  tier: WorldTier;
  rng: Rng;
  slot?: GearSlot;
  /** Shifts the rarity roll up this many steps (events' `loot.rarityBoost`, caches). */
  rarityBoost?: number;
  /** Floors the rolled rarity at this value (guaranteed-rare alpha loot, guaranteed-epic apex loot). */
  guaranteedMinRarity?: Rarity;
}

function pickSlot(rng: Rng): GearSlot {
  // Dino slots 70% / master slots 30% (Phase 4 brief).
  const pool: GearSlot[] = rng.chance(0.7) ? DINO_SLOTS : MASTER_SLOTS;
  return rng.pick(pool);
}

function weightedRarityIndex(weights: Record<Rarity, number>, rng: Rng): number {
  const total = RARITY_ORDER.reduce((sum, r) => sum + weights[r], 0);
  if (total <= 0) return 0;
  let roll = rng.next() * total;
  for (let i = 0; i < RARITY_ORDER.length; i++) {
    const w = weights[RARITY_ORDER[i] as Rarity];
    if (roll < w) return i;
    roll -= w;
  }
  return RARITY_ORDER.length - 1;
}

function rollRarity(tier: WorldTier, rng: Rng, rarityBoost: number, guaranteedMinRarity?: Rarity): Rarity {
  let idx = weightedRarityIndex(RARITY_WEIGHTS[tier], rng);
  idx = Math.min(RARITY_ORDER.length - 1, idx + rarityBoost);
  if (guaranteedMinRarity) {
    idx = Math.max(idx, RARITY_ORDER.indexOf(guaranteedMinRarity));
  }
  return RARITY_ORDER[idx] as Rarity;
}

/** Roll one affix's value within its ilvl-1 reference range, scaled by `ilvl`. */
function rollAffixValue(affix: AffixDef, ilvl: number, rng: Rng): number {
  const scale = ilvlScale(ilvl);
  if (affix.effect.kind === 'onHitStatus') {
    const { chanceMin, chanceMax } = affix.effect;
    const base = chanceMin + rng.next() * (chanceMax - chanceMin);
    return Math.min(1, Math.round(base * scale * 1000) / 1000);
  }
  const { min, max } = affix.effect;
  const base = min + rng.next() * (max - min);
  return Math.max(1, Math.round(base * scale));
}

/** Roll `count` distinct, slot-legal affixes. */
function rollAffixes(slot: GearSlot, count: number, ilvl: number, rng: Rng): RolledAffix[] {
  if (count <= 0) return [];
  const eligible = AFFIX_LIST.filter((a) => a.slots.includes(slot));
  const chosen = rng.shuffle(eligible).slice(0, Math.min(count, eligible.length));
  return chosen.map((affix) => ({ affix: affix.id, value: rollAffixValue(affix, ilvl, rng) }));
}

function composeName(slot: GearSlot, rarity: Rarity, affixes: RolledAffix[], rng: Rng): string {
  const base = rng.pick(BASE_NAMES[slot]);
  if (rarity === 'legendary') {
    return `${base} of ${rng.pick(LEGENDARY_EPITHETS)}`;
  }
  const first = affixes[0] ? AFFIXES[affixes[0].affix] : undefined;
  return first ? `${base} ${first.nameFragment}` : base;
}

/** Generate a fresh item: rarity → affix count/values → name (DESIGN §5). */
export function generateItem(opts: GenerateItemOpts): ItemInstance {
  const rng = opts.rng;
  const slot = opts.slot ?? pickSlot(rng);
  const rarity = rollRarity(opts.tier, rng, opts.rarityBoost ?? 0, opts.guaranteedMinRarity);
  const affixes = rollAffixes(slot, AFFIX_COUNT_BY_RARITY[rarity], opts.ilvl, rng);
  const legendaryPower = rarity === 'legendary' ? rng.pick(LEGENDARY_POWERS).id : undefined;
  const name = composeName(slot, rarity, affixes, rng);

  return {
    uid: genUid('i', rng),
    slot,
    rarity,
    ilvl: opts.ilvl,
    name,
    affixes,
    legendaryPower,
  };
}

// ---------------------------------------------------------------------------
// Essence: salvage / release / upgrade
// ---------------------------------------------------------------------------

/** Essence from salvaging an item — scales with rarity and item level. */
export function salvageEssence(item: ItemInstance): number {
  return Math.max(1, Math.round(SALVAGE_ESSENCE_BASE[item.rarity] * ilvlScale(item.ilvl)));
}

/** Essence from releasing a tamed dino — scales with level. */
export function releaseEssence(dino: DinoInstance): number {
  return Math.max(1, Math.round(RELEASE_ESSENCE_PER_LEVEL * dino.level));
}

/** Essence cost to upgrade `item` one rarity step (positive even at legendary, where upgrade is a no-op). */
export function upgradeCost(item: ItemInstance): number {
  return Math.max(1, Math.round(UPGRADE_ESSENCE_COST[item.rarity] * ilvlScale(item.ilvl)));
}

/**
 * Upgrade an item one rarity step: keeps all existing affixes and rolls
 * exactly the newly-entitled affix slot (none, going epic -> legendary,
 * which only adds a legendary power). DESIGN §5: essence "upgrades an
 * item's rarity one step, rerolling nothing" — so the item's `name` is left
 * untouched even when it crosses into legendary. Already-legendary items are
 * at the max step and are returned unchanged (a fresh copy).
 */
export function upgradeItem(item: ItemInstance, rng: Rng): ItemInstance {
  const currentIdx = RARITY_ORDER.indexOf(item.rarity);
  if (currentIdx >= RARITY_ORDER.length - 1) {
    return { ...item, affixes: item.affixes.map((a) => ({ ...a })) };
  }

  const newRarity = RARITY_ORDER[currentIdx + 1] as Rarity;
  const newAffixCount = AFFIX_COUNT_BY_RARITY[newRarity];
  const existingIds = new Set(item.affixes.map((a) => a.affix));
  const eligible = AFFIX_LIST.filter((a) => a.slots.includes(item.slot) && !existingIds.has(a.id));
  const needed = Math.max(0, newAffixCount - item.affixes.length);
  const rolled = rng.shuffle(eligible).slice(0, needed);
  const newAffixes: RolledAffix[] = [
    ...item.affixes.map((a) => ({ ...a })),
    ...rolled.map((affix) => ({ affix: affix.id, value: rollAffixValue(affix, item.ilvl, rng) })),
  ];
  const legendaryPower = newRarity === 'legendary' ? (item.legendaryPower ?? rng.pick(LEGENDARY_POWERS).id) : item.legendaryPower;

  return { ...item, rarity: newRarity, affixes: newAffixes, legendaryPower };
}

// ---------------------------------------------------------------------------
// rewardLoot
// ---------------------------------------------------------------------------

export interface RewardLootOpts {
  nodeKind: NodeKind;
  tier: WorldTier;
  /** Drives item level; battle/alpha/apex pass the defeated enemy's level. */
  enemyLevel: number;
  /** Whole-number percent (Handler/Survivalist `lootFind` skills + satchel affixes). */
  lootFindPercent: number;
  rng: Rng;
}

export interface RewardLootResult {
  items: ItemInstance[];
  essence: number;
}

function rollEssence(range: [number, number], rng: Rng): number {
  return rng.int(range[0], range[1]);
}

/**
 * Per-node-kind reward table (DESIGN §3/§7): battle rolls a chance at one
 * item; Alpha/Apex guarantee a rarity floor; Cache rolls 1-2 boosted items.
 * `lootFindPercent` raises battle/cache drop chance (clamped to 100%).
 */
export function rewardLoot(opts: RewardLootOpts): RewardLootResult {
  const ilvl = Math.max(1, opts.enemyLevel);
  const findMult = 1 + opts.lootFindPercent / 100;
  const items: ItemInstance[] = [];
  let essence = 0;

  switch (opts.nodeKind) {
    case 'battle': {
      if (opts.rng.chance(Math.min(1, BATTLE_LOOT_CHANCE * findMult))) {
        items.push(generateItem({ ilvl, tier: opts.tier, rng: opts.rng }));
      }
      essence = rollEssence(BATTLE_ESSENCE_RANGE, opts.rng);
      break;
    }
    case 'alpha': {
      items.push(generateItem({ ilvl, tier: opts.tier, rng: opts.rng, guaranteedMinRarity: ALPHA_LOOT_MIN_RARITY }));
      essence = rollEssence(ALPHA_ESSENCE_RANGE, opts.rng);
      break;
    }
    case 'cache': {
      const count = opts.rng.chance(Math.min(1, CACHE_SECOND_ITEM_CHANCE * findMult)) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        items.push(generateItem({ ilvl, tier: opts.tier, rng: opts.rng, rarityBoost: CACHE_LOOT_RARITY_BOOST }));
      }
      essence = rollEssence(CACHE_ESSENCE_RANGE, opts.rng);
      break;
    }
    case 'apex': {
      for (let i = 0; i < APEX_LOOT_ITEM_COUNT; i++) {
        items.push(generateItem({ ilvl, tier: opts.tier, rng: opts.rng, guaranteedMinRarity: APEX_LOOT_MIN_RARITY }));
      }
      essence = rollEssence(APEX_ESSENCE_RANGE, opts.rng);
      break;
    }
    case 'event':
    case 'grove':
      break; // resolved by the event/grove flow itself, not a combat reward.
  }

  return { items, essence };
}
