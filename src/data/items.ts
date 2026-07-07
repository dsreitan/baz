/**
 * Item generation tables — base names per slot, legendary powers, and
 * rarity weight tables per World Tier. The Phase 4 loot generator composes
 * names as `<base name> <affix fragment>` and interprets legendary power
 * ids in the battle engine.
 */
import type { GearSlot, Rarity, WorldTier } from '../core/types';

/** Base item names per slot; the generator picks one and appends affix fragments. */
export const BASE_NAMES: Record<GearSlot, string[]> = {
  plating: [
    'Ironhide Plating',
    'Ridgeback Carapace',
    'Basalt Scale Mail',
    'Mossbound Shell',
    'Glacier Plate',
  ],
  talon: [
    'Hooked Talon',
    'Serrated Sickle-Claw',
    'Obsidian Spur',
    'Stormrend Claw',
    'Bonepiercer',
  ],
  charm: [
    'Amber Fetish',
    'Glyphstone Pendant',
    'Feathered Totem',
    'Tidewoven Bead',
    'Emberglass Bauble',
  ],
  whistle: [
    'Bone Whistle',
    'Carved Horncall',
    'Reedpipe of Command',
    'Thunderclap Whistle',
  ],
  satchel: [
    'Hide Satchel',
    "Forager's Pouch",
    'Trailworn Pack',
    "Lurewright's Kit",
  ],
  standard: [
    "Packmaster's Banner",
    'Totem Standard',
    'Warhide Pennant',
    'Skyplume Standard',
  ],
};

export interface LegendaryPowerDef {
  /** stored on ItemInstance.legendaryPower; interpreted by the engine */
  id: string;
  name: string;
  text: string;
}

/** Unique legendary powers — one is rolled onto every legendary item. */
export const LEGENDARY_POWERS: LegendaryPowerDef[] = [
  {
    id: 'echoing_command',
    name: 'Echoing Command',
    text: 'Once per battle, your Command repeats itself at the start of the next round.',
  },
  {
    id: 'stormheart_core',
    name: 'Stormheart Core',
    text: 'The wearer’s strikes have a 25% chance to also apply Charged.',
  },
  {
    id: 'everburning_sinew',
    name: 'Everburning Sinew',
    text: 'When the wearer consumes a combo state, its cooldowns tick down one extra turn.',
  },
  {
    id: 'lifewarden_bloom',
    name: 'Lifewarden Bloom',
    text: 'When the wearer falls below 30% HP, it gains Regen (8%/turn) for 2 turns. Once per battle.',
  },
  {
    id: 'apex_hunger',
    name: 'Apex Hunger',
    text: 'The wearer deals +20% damage to Alphas and Apex bosses.',
  },
  {
    id: 'lure_of_the_wilds',
    name: 'Lure of the Wilds',
    text: 'Tame attempts that fail do not enrage the target.',
  },
];

/**
 * Rarity roll weights per World Tier (relative weights, not percentages).
 * Legendary is impossible at tier 1; the whole table shifts up per tier.
 */
export const RARITY_WEIGHTS: Record<WorldTier, Record<Rarity, number>> = {
  1: { common: 55, uncommon: 32, rare: 12, epic: 1, legendary: 0 },
  2: { common: 40, uncommon: 35, rare: 19, epic: 5, legendary: 1 },
  3: { common: 25, uncommon: 35, rare: 27, epic: 11, legendary: 2 },
  4: { common: 12, uncommon: 28, rare: 34, epic: 20, legendary: 6 },
};
